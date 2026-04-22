/**
 * endGame.handleGameOver — orchestration test.
 *
 * Mocks the registry + supabase surface and asserts the expected
 * sequence:
 *   1. game_over broadcast (before the RPC)
 *   2. end_game RPC with the winner user id
 *   3. room.shutdown('game-over')
 *   4. registry.delete(roomId)
 *
 * The broadcast is observed via a spy attached socket; the RPC via a
 * call log on the mock client.
 */

import { beforeAll, describe, expect, test } from 'bun:test';

beforeAll(() => {
  process.env.SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://stub.local';
  process.env.SUPABASE_SERVICE_ROLE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'service-stub-key';
  process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? 'anon-stub-key';
});

import { TERR_ORDER, apply, createInitialState } from '@riskrask/engine';
import type { GameState } from '@riskrask/engine';
import type { ServerMsg } from '@riskrask/shared';
import { Room } from '../src/rooms/Room';
import { handleGameOver } from '../src/rooms/endGame';
import type { EndGameSupabaseClient } from '../src/rooms/endGame';
import type { Seat } from '../src/rooms/seat';

const PLAYERS = [
  { id: '0', name: 'Alice', color: '#dc2626', isAI: false },
  { id: '1', name: 'Bob', color: '#2563eb', isAI: false },
];

function buildMainPhase(): GameState {
  let s = createInitialState({ seed: 'endgame-test', players: PLAYERS });
  for (const name of TERR_ORDER) {
    s = apply(s, { type: 'claim-territory', territory: name }).next;
  }
  while (s.phase === 'setup-reinforce') {
    const cp = s.players[s.currentPlayerIdx]!;
    const owned = Object.keys(s.territories).find((n) => s.territories[n]?.owner === cp.id)!;
    s = apply(s, { type: 'setup-reinforce', territory: owned }).next;
  }
  return s;
}

function buildSeats(): Seat[] {
  return [
    { seatIdx: 0, userId: 'u-alice', isAi: false, archId: null, connected: true, afk: false },
    { seatIdx: 1, userId: 'u-bob', isAi: false, archId: null, connected: true, afk: false },
  ];
}

function makeMockSupabase(): {
  client: EndGameSupabaseClient;
  calls: Array<{ fn: string; args: Record<string, unknown> }>;
} {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const client: EndGameSupabaseClient = {
    async rpc(fn, args) {
      calls.push({ fn, args: args as unknown as Record<string, unknown> });
      return { data: null, error: null };
    },
  };
  return { client, calls };
}

describe('handleGameOver', () => {
  test('broadcasts game_over, calls end_game RPC, shuts down, deletes', async () => {
    const s0 = buildMainPhase();
    const broadcasted: ServerMsg[] = [];
    const closedCalls: Array<{ code?: number }> = [];
    let terminatedAfter = false;

    const room = new Room('r-end', 'g-end', s0, buildSeats(), { roomCode: 'ENDGME' });
    room.attach(0, {
      send: (m) => broadcasted.push(m),
      close: (code) => {
        terminatedAfter = room.isTerminated();
        const entry: { code?: number } = {};
        if (code !== undefined) entry.code = code;
        closedCalls.push(entry);
      },
    });
    room.attach(1, () => {});

    // Force the engine into a terminal state so `finalState.winner` is set.
    const conceded = apply(s0, { type: 'concede' }).next;
    expect(conceded.winner).toBe('1');

    const { client, calls } = makeMockSupabase();
    const deleted: string[] = [];
    const deps = {
      registry: {
        get: () => room,
        delete: (id: string) => {
          deleted.push(id);
        },
      },
      serviceClient: () => client,
      flushDelayMs: 0,
    };

    await handleGameOver('r-end', '1', conceded, deps);

    // Broadcast frame.
    const overs = broadcasted.filter(
      (m): m is Extract<ServerMsg, { type: 'game_over' }> => m.type === 'game_over',
    );
    expect(overs.length).toBe(1);
    expect(overs[0]!.winnerPlayerId).toBe('1');
    expect(overs[0]!.winnerSeatIdx).toBe(1);
    expect(overs[0]!.winnerUserId).toBe('u-bob');
    expect(overs[0]!.winnerDisplay).toBe('Bob');

    // RPC fired with the right args.
    expect(calls.length).toBe(1);
    expect(calls[0]!.fn).toBe('end_game');
    expect(calls[0]!.args).toEqual({ p_room_id: 'r-end', p_winner_user_id: 'u-bob' });

    // Shutdown closed the socket and registry.delete was called.
    expect(closedCalls.length).toBe(1);
    expect(closedCalls[0]!.code).toBe(1000);
    expect(terminatedAfter).toBe(true);
    expect(deleted).toEqual(['r-end']);
  });

  test('AI winner surfaces with winnerUserId = null', async () => {
    const s0 = buildMainPhase();
    const aiSeats: Seat[] = [
      { seatIdx: 0, userId: 'u-alice', isAi: false, archId: null, connected: true, afk: false },
      { seatIdx: 1, userId: null, isAi: true, archId: 'dilettante', connected: true, afk: false },
    ];
    const room = new Room('r-end-ai', 'g-end-ai', s0, aiSeats, { roomCode: 'ENDAI1' });
    const broadcasted: ServerMsg[] = [];
    room.attach(0, (m) => broadcasted.push(m));

    const terminal = apply(s0, { type: 'concede' }).next;
    expect(terminal.winner).toBe('1');

    const { client } = makeMockSupabase();
    await handleGameOver('r-end-ai', '1', terminal, {
      registry: { get: () => room, delete: () => {} },
      serviceClient: () => client,
      flushDelayMs: 0,
    });

    const over = broadcasted.find(
      (m): m is Extract<ServerMsg, { type: 'game_over' }> => m.type === 'game_over',
    );
    expect(over?.winnerUserId).toBeNull();
    expect(over?.winnerDisplay).toBe('Bob');
  });

  test('logs and continues when end_game RPC returns an error', async () => {
    const s0 = buildMainPhase();
    const room = new Room('r-end-err', 'g-end-err', s0, buildSeats(), { roomCode: 'ENDERR' });
    room.attach(0, () => {});

    const client: EndGameSupabaseClient = {
      async rpc() {
        return { data: null, error: { message: 'simulated DB failure' } };
      },
    };
    const deleted: string[] = [];

    const terminal = apply(s0, { type: 'concede' }).next;
    await handleGameOver('r-end-err', '1', terminal, {
      registry: { get: () => room, delete: (id) => deleted.push(id) },
      serviceClient: () => client,
      flushDelayMs: 0,
    });

    // Cleanup still ran despite the RPC error.
    expect(room.isTerminated()).toBe(true);
    expect(deleted).toEqual(['r-end-err']);
  });

  test('no-op if room not found in the registry', async () => {
    const { client, calls } = makeMockSupabase();
    await handleGameOver('r-missing', '1', buildMainPhase(), {
      registry: { get: () => undefined, delete: () => {} },
      serviceClient: () => client,
      flushDelayMs: 0,
    });
    expect(calls.length).toBe(0);
  });

  test('no-op if room is already terminated', async () => {
    const s0 = buildMainPhase();
    const room = new Room('r-term', 'g-term', s0, buildSeats(), { roomCode: 'TERM' });
    room.shutdown('manual');

    const { client, calls } = makeMockSupabase();
    const deleted: string[] = [];
    await handleGameOver('r-term', '1', s0, {
      registry: { get: () => room, delete: (id) => deleted.push(id) },
      serviceClient: () => client,
      flushDelayMs: 0,
    });
    expect(calls.length).toBe(0);
    expect(deleted.length).toBe(0);
  });
});
