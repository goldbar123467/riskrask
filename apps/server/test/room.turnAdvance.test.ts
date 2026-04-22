/**
 * Room.applyIntent — turn_advance broadcast + auto-run on AI seat.
 *
 * These tests assert the new S3 behaviour added on top of the existing
 * applyIntent pipeline:
 *   1. When `state.currentPlayerIdx` changes, a `turn_advance` frame is
 *      broadcast to every attached socket with the new seat and deadline.
 *   2. When the new seat is AI, the injected `runFallback` fires in a
 *      microtask.
 *   3. `onTurnAdvance` is called before the broadcast so the registry
 *      restarts its timer and the fresh deadline makes it into the frame.
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
import type { Seat } from '../src/rooms/seat';

const PLAYERS = [
  { id: '0', name: 'Alice', color: '#dc2626', isAI: false },
  { id: '1', name: 'Bob', color: '#2563eb', isAI: true },
];

function buildReinforcePhaseState(): GameState {
  let s = createInitialState({ seed: 'turn-advance-test', players: PLAYERS });
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
    { seatIdx: 1, userId: null, isAi: true, archId: 'dilettante', connected: true, afk: false },
  ];
}

function collect() {
  const log: ServerMsg[] = [];
  return { send: (m: ServerMsg) => log.push(m), log };
}

describe('Room — turn_advance broadcast', () => {
  test('emits turn_advance with fresh deadline when currentPlayerIdx changes', async () => {
    const s0 = buildReinforcePhaseState();
    expect(s0.phase).toBe('reinforce');
    expect(s0.currentPlayerIdx).toBe(0);

    const deadlines: number[] = [];
    let deadlineOffset = 0;
    const room = new Room('r-ta1', 'g-ta1', s0, buildSeats(), {
      roomCode: 'TURNAD',
      onTurnAdvance: () => {
        // Registry would reset its TurnDriver here; we simulate by
        // advancing the deadline value the getter returns.
        deadlineOffset += 30_000;
        deadlines.push(1_000 + deadlineOffset);
      },
      getTurnDeadline: () => (deadlines.length > 0 ? deadlines[deadlines.length - 1]! : null),
    });

    const rec = collect();
    room.attach(0, rec.send);

    // Walk seat 0 through its turn to trigger a turn advance.
    const cp = s0.players[s0.currentPlayerIdx]!;
    const owned = Object.keys(s0.territories).find((n) => s0.territories[n]?.owner === cp.id)!;
    await room.applyIntent(0, { type: 'reinforce', territory: owned, count: cp.reserves });
    await room.applyIntent(0, { type: 'end-attack-phase' });
    await room.applyIntent(0, { type: 'end-turn' });

    // Seat must now be 1. Exactly one turn_advance must have fired.
    expect(room.getState().currentPlayerIdx).toBe(1);
    const advances = rec.log.filter(
      (m): m is Extract<ServerMsg, { type: 'turn_advance' }> => m.type === 'turn_advance',
    );
    expect(advances.length).toBe(1);
    expect(advances[0]!.currentSeatIdx).toBe(1);
    expect(advances[0]!.deadlineMs).toBe(deadlines[0]!);
    expect(advances[0]!.turnNumber).toBe(room.getState().turn);
  });

  test('runs AI fallback (microtask-queued) when new seat is AI', async () => {
    const s0 = buildReinforcePhaseState();
    const fallbackCalls: number[] = [];
    const room = new Room('r-ta2', 'g-ta2', s0, buildSeats(), {
      roomCode: 'TURNAD2',
      runFallback: async (_room, seatIdx) => {
        fallbackCalls.push(seatIdx);
      },
    });
    room.attach(0, () => {});
    room.attach(1, () => {});

    // Drive seat 0's turn to completion. When end-turn lands the new seat
    // is AI (seat 1), so the Room must microtask-queue the fallback.
    const cp = s0.players[s0.currentPlayerIdx]!;
    const owned = Object.keys(s0.territories).find((n) => s0.territories[n]?.owner === cp.id)!;
    await room.applyIntent(0, { type: 'reinforce', territory: owned, count: cp.reserves });
    await room.applyIntent(0, { type: 'end-attack-phase' });
    await room.applyIntent(0, { type: 'end-turn' });

    // Fallback runs microtask-queued, so we yield once for it to drain.
    await new Promise((r) => queueMicrotask(() => r(null)));
    expect(fallbackCalls).toEqual([1]);
  });

  test('no turn_advance when currentPlayerIdx is unchanged', async () => {
    const s0 = buildReinforcePhaseState();
    const room = new Room('r-ta3', 'g-ta3', s0, buildSeats(), { roomCode: 'TURNAD3' });
    const rec = collect();
    room.attach(0, rec.send);

    // Reinforce doesn't advance the seat; neither does end-attack-phase.
    const cp = s0.players[s0.currentPlayerIdx]!;
    const owned = Object.keys(s0.territories).find((n) => s0.territories[n]?.owner === cp.id)!;
    await room.applyIntent(0, { type: 'reinforce', territory: owned, count: cp.reserves });
    await room.applyIntent(0, { type: 'end-attack-phase' });

    expect(rec.log.filter((m) => m.type === 'turn_advance').length).toBe(0);
  });
});

describe('Room — terminated guard', () => {
  test('applyIntent rejects with GAME_TERMINATED after shutdown', async () => {
    const s0 = buildReinforcePhaseState();
    const room = new Room('r-term', 'g-term', s0, buildSeats(), { roomCode: 'TERMD1' });
    room.attach(0, () => {});
    room.shutdown('manual');

    const cp = s0.players[s0.currentPlayerIdx]!;
    const owned = Object.keys(s0.territories).find((n) => s0.territories[n]?.owner === cp.id)!;
    const promise = room.applyIntent(0, {
      type: 'reinforce',
      territory: owned,
      count: cp.reserves,
    });
    await expect(promise).rejects.toMatchObject({ code: 'GAME_TERMINATED' });
  });

  test('shutdown closes attached sockets with 1000', () => {
    const s0 = buildReinforcePhaseState();
    const room = new Room('r-term2', 'g-term2', s0, buildSeats(), { roomCode: 'TERMD2' });
    const closeCalls: Array<{ code?: number; reason?: string }> = [];
    room.attach(0, {
      send: () => {},
      close: (code, reason) => {
        const entry: { code?: number; reason?: string } = {};
        if (code !== undefined) entry.code = code;
        if (reason !== undefined) entry.reason = reason;
        closeCalls.push(entry);
      },
    });
    room.shutdown('game-over');
    expect(closeCalls.length).toBe(1);
    expect(closeCalls[0]!.code).toBe(1000);
  });
});
