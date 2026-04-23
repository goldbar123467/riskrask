/**
 * Room.applyIntent — turn_advance broadcast + auto-run on AI seat.
 *
 * These tests assert the "active-segment-advance" behaviour on top of the
 * applyIntent pipeline:
 *   1. When `state.currentPlayerIdx` changes, a `turn_advance` frame is
 *      broadcast with the new seat and deadline.
 *   2. When the phase changes within the same seat (reinforce -> attack ->
 *      fortify), a `turn_advance` frame is ALSO broadcast so the client's
 *      30s countdown restarts at each active segment. The message type is
 *      reused; semantically it's an "active-segment-advance".
 *   3. When the new seat is AI, the injected `runFallback` fires in a
 *      microtask.
 *   4. `onTurnAdvance` is called before the broadcast so the registry
 *      restarts its TurnDriver and the fresh deadline makes it into the frame.
 *   5. Phase transitioning to `'done'` (game-over) does NOT trigger an
 *      advance — we don't restart the timer on a finished game.
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
        deadlineOffset += 30_000;
        deadlines.push(1_000 + deadlineOffset);
      },
      getTurnDeadline: () => (deadlines.length > 0 ? deadlines[deadlines.length - 1]! : null),
    });

    const rec = collect();
    room.attach(0, rec.send);

    // Walk seat 0 through its turn. With the new per-segment behaviour
    // this emits three turn_advance frames: reinforce->attack, attack->fortify,
    // fortify->next-seat's-reinforce.
    const cp = s0.players[s0.currentPlayerIdx]!;
    const owned = Object.keys(s0.territories).find((n) => s0.territories[n]?.owner === cp.id)!;
    await room.applyIntent(0, { type: 'reinforce', territory: owned, count: cp.reserves });
    await room.applyIntent(0, { type: 'end-attack-phase' });
    await room.applyIntent(0, { type: 'end-turn' });

    expect(room.getState().currentPlayerIdx).toBe(1);
    const advances = rec.log.filter(
      (m): m is Extract<ServerMsg, { type: 'turn_advance' }> => m.type === 'turn_advance',
    );
    // Three active segments were entered: seat0.attack, seat0.fortify, seat1.reinforce.
    expect(advances.length).toBe(3);
    // The final advance is the seat flip to seat 1 with the freshest deadline.
    expect(advances[advances.length - 1]!.currentSeatIdx).toBe(1);
    expect(advances[advances.length - 1]!.deadlineMs).toBe(deadlines[deadlines.length - 1]!);
    expect(advances[advances.length - 1]!.turnNumber).toBe(room.getState().turn);
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

    const cp = s0.players[s0.currentPlayerIdx]!;
    const owned = Object.keys(s0.territories).find((n) => s0.territories[n]?.owner === cp.id)!;
    await room.applyIntent(0, { type: 'reinforce', territory: owned, count: cp.reserves });
    await room.applyIntent(0, { type: 'end-attack-phase' });
    await room.applyIntent(0, { type: 'end-turn' });

    await new Promise((r) => queueMicrotask(() => r(null)));
    // Fallback fires exactly once — only on the seat flip to AI, not on
    // intra-seat phase changes.
    expect(fallbackCalls).toEqual([1]);
  });

  test('restarts timer on phase change within same seat', async () => {
    const s0 = buildReinforcePhaseState();
    expect(s0.phase).toBe('reinforce');
    expect(s0.currentPlayerIdx).toBe(0);

    const deadlines: number[] = [];
    let base = 100_000;
    const room = new Room('r-ta3', 'g-ta3', s0, buildSeats(), {
      roomCode: 'TURNAD3',
      onTurnAdvance: () => {
        base += 30_000;
        deadlines.push(base);
      },
      getTurnDeadline: () => (deadlines.length > 0 ? deadlines[deadlines.length - 1]! : null),
    });
    const rec = collect();
    room.attach(0, rec.send);

    const cp = s0.players[s0.currentPlayerIdx]!;
    const owned = Object.keys(s0.territories).find((n) => s0.territories[n]?.owner === cp.id)!;

    // Step 1: reinforce all reserves -> phase flips reinforce -> attack, seat unchanged.
    await room.applyIntent(0, { type: 'reinforce', territory: owned, count: cp.reserves });
    expect(room.getState().phase).toBe('attack');
    expect(room.getState().currentPlayerIdx).toBe(0);

    // Step 2: end-attack-phase -> phase flips attack -> fortify, seat unchanged.
    await room.applyIntent(0, { type: 'end-attack-phase' });
    expect(room.getState().phase).toBe('fortify');
    expect(room.getState().currentPlayerIdx).toBe(0);

    const advances = rec.log.filter(
      (m): m is Extract<ServerMsg, { type: 'turn_advance' }> => m.type === 'turn_advance',
    );
    // Two segment advances within the same seat must have been broadcast.
    expect(advances.length).toBe(2);
    expect(advances[0]!.currentSeatIdx).toBe(0);
    expect(advances[1]!.currentSeatIdx).toBe(0);
    expect(advances[0]!.deadlineMs).toBe(deadlines[0]!);
    expect(advances[1]!.deadlineMs).toBe(deadlines[1]!);
    expect(advances[1]!.deadlineMs).toBeGreaterThan(advances[0]!.deadlineMs);
  });

  test('no turn_advance when neither seat nor phase changes', async () => {
    const s0 = buildReinforcePhaseState();
    const room = new Room('r-ta4', 'g-ta4', s0, buildSeats(), { roomCode: 'TURNAD4' });
    const rec = collect();
    room.attach(0, rec.send);

    const cp = s0.players[s0.currentPlayerIdx]!;
    const owned = Object.keys(s0.territories).find((n) => s0.territories[n]?.owner === cp.id)!;

    // Partial reinforce (1 of N reserves) keeps phase='reinforce' and seat=0.
    expect(cp.reserves).toBeGreaterThan(1);
    await room.applyIntent(0, { type: 'reinforce', territory: owned, count: 1 });
    expect(room.getState().phase).toBe('reinforce');
    expect(room.getState().currentPlayerIdx).toBe(0);

    expect(rec.log.filter((m) => m.type === 'turn_advance').length).toBe(0);
  });

  test('does not fire onTurnAdvance when phase transitions to done', async () => {
    // Construct a near-victory state: seat 0 owns all territories but one,
    // which is held by seat 1 with a single army. Seat 0 attacks it and wins.
    let s = buildReinforcePhaseState();

    const terrs = { ...s.territories };
    const p0 = s.players[0]!.id;
    const p1 = s.players[1]!.id;
    for (const name of Object.keys(terrs)) {
      const t = terrs[name]!;
      if (name === 'Alaska') {
        terrs[name] = { ...t, owner: p1, armies: 1 };
      } else {
        terrs[name] = { ...t, owner: p0, armies: name === 'Kamchatka' ? 30 : 1 };
      }
    }
    s = {
      ...s,
      phase: 'attack',
      currentPlayerIdx: 0,
      territories: terrs,
      players: s.players.map((p) => ({ ...p, reserves: 0 })),
    };

    let advanceCalls = 0;
    const room = new Room('r-done', 'g-done', s, buildSeats(), {
      roomCode: 'TADONE',
      onTurnAdvance: () => {
        advanceCalls += 1;
      },
      getTurnDeadline: () => 1,
    });
    room.attach(0, () => {});

    // Blitz guarantees capture (30 vs 1). Then resolve move-after-capture
    // so the territory transfer finalizes and the victory check fires.
    await room.applyIntent(0, { type: 'attack-blitz', from: 'Kamchatka', to: 'Alaska' });
    const pend = room.getState().pendingMove;
    expect(pend).toBeDefined();
    await room.applyIntent(0, { type: 'move-after-capture', count: pend!.min });

    expect(room.getState().phase).toBe('done');
    expect(room.getState().winner).toBe(p0);
    expect(advanceCalls).toBe(0);
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
