/**
 * Room.applyIntent — onGameOver callback + terminated guard.
 *
 * Drives a 2-player game to victory via a concede from seat 0. The engine
 * promotes seat 1 to winner immediately; the Room must fire `onGameOver`
 * exactly once and refuse further intents.
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
import { Room } from '../src/rooms/Room';
import type { Seat } from '../src/rooms/seat';

const PLAYERS = [
  { id: '0', name: 'Alice', color: '#dc2626', isAI: false },
  { id: '1', name: 'Bob', color: '#2563eb', isAI: false },
];

function buildReinforcePhaseState(): GameState {
  let s = createInitialState({ seed: 'gameover-test', players: PLAYERS });
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

function seats(): Seat[] {
  return [
    { seatIdx: 0, userId: 'u-a', isAi: false, archId: null, connected: true, afk: false },
    { seatIdx: 1, userId: 'u-b', isAi: false, archId: null, connected: true, afk: false },
  ];
}

describe('Room onGameOver', () => {
  test('fires exactly once when the engine declares a winner', async () => {
    const s0 = buildReinforcePhaseState();
    const calls: Array<{ winnerPlayerId: string }> = [];
    const room = new Room('r-go1', 'g-go1', s0, seats(), {
      roomCode: 'GOOVER',
      onGameOver: (winnerPlayerId) => {
        calls.push({ winnerPlayerId });
      },
    });
    room.attach(0, () => {});
    room.attach(1, () => {});

    // Seat 0 concedes — only seat 1 remains → engine sets winner.
    await room.applyIntent(0, { type: 'concede' });

    expect(room.getState().winner).toBe('1');
    expect(room.getState().phase).toBe('done');
    expect(calls.length).toBe(1);
    expect(calls[0]!.winnerPlayerId).toBe('1');
  });

  test('applyIntent does NOT fire onGameOver twice on subsequent actions', async () => {
    const s0 = buildReinforcePhaseState();
    const calls: number[] = [];
    const room = new Room('r-go2', 'g-go2', s0, seats(), {
      roomCode: 'GOOVER2',
      onGameOver: () => {
        calls.push(1);
      },
    });
    room.attach(0, () => {});
    room.attach(1, () => {});

    await room.applyIntent(0, { type: 'concede' });
    expect(calls.length).toBe(1);

    // Simulate registry teardown ordering: the onGameOver handler is
    // expected to call shutdown() shortly after. Once terminated,
    // further intents reject — so no second onGameOver can fire.
    room.shutdown('game-over');
    await expect(room.applyIntent(0, { type: 'end-turn' })).rejects.toMatchObject({
      code: 'GAME_TERMINATED',
    });
    expect(calls.length).toBe(1);
  });

  test('onGameOver skipped if the room was shut down before the victory', async () => {
    const s0 = buildReinforcePhaseState();
    const calls: number[] = [];
    const room = new Room('r-go3', 'g-go3', s0, seats(), {
      roomCode: 'GOOVER3',
      onGameOver: () => {
        calls.push(1);
      },
    });
    room.attach(0, () => {});
    room.shutdown('manual');

    await expect(room.applyIntent(0, { type: 'concede' })).rejects.toMatchObject({
      code: 'GAME_TERMINATED',
    });
    expect(calls.length).toBe(0);
  });
});
