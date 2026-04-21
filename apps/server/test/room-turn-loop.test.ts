/**
 * Room authoritative pipeline — unit-level.
 *
 * Builds an in-memory Room directly against a minimally-advanced engine
 * state (past the setup-claim phase) and verifies:
 *   - applyIntent drives the state forward
 *   - hash advances with every action
 *   - every attached send callback receives `applied`
 *   - NOT_YOUR_TURN fires when a non-current seat tries to act
 *   - the injected TurnLogger.write is called for every action
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
import { Room, RoomError, type TurnLogger } from '../src/rooms/Room';
import type { Seat } from '../src/rooms/seat';

const PLAYERS = [
  { id: '0', name: 'Alice', color: '#dc2626', isAI: false },
  { id: '1', name: 'Bob', color: '#2563eb', isAI: false },
];

/** Drive through setup-claim + setup-reinforce so we land in the main reinforce phase. */
function buildReinforcePhaseState(): GameState {
  let s = createInitialState({ seed: 'room-test', players: PLAYERS });
  // Claim all 42.
  for (const name of TERR_ORDER) {
    s = apply(s, { type: 'claim-territory', territory: name }).next;
  }
  // setup-reinforce: each player drains reserves onto the first owned
  // territory. We rotate the active player each call.
  let guard = 0;
  while (s.phase === 'setup-reinforce' && guard < 500) {
    guard++;
    const cp = s.players[s.currentPlayerIdx]!;
    const owned = Object.keys(s.territories).find((n) => s.territories[n]?.owner === cp.id);
    if (!owned) break;
    s = apply(s, { type: 'setup-reinforce', territory: owned }).next;
  }
  return s;
}

function buildSeats(): Seat[] {
  return [
    {
      seatIdx: 0,
      userId: 'u-alice',
      isAi: false,
      archId: null,
      connected: true,
      afk: false,
    },
    {
      seatIdx: 1,
      userId: 'u-bob',
      isAi: false,
      archId: null,
      connected: true,
      afk: false,
    },
  ];
}

function makeRecorder() {
  const out: ServerMsg[] = [];
  return { send: (m: ServerMsg) => out.push(m), log: out };
}

describe('Room.applyIntent — reinforce → attack → fortify → end-turn', () => {
  test('broadcasts applied to both seats and advances hash', async () => {
    const s0 = buildReinforcePhaseState();
    expect(s0.phase).toBe('reinforce');

    const logCalls: Array<{ seq: number; action: unknown }> = [];
    const logger: TurnLogger = {
      write: async (e) => {
        logCalls.push({ seq: e.seq, action: e.action });
      },
    };

    const room = new Room('r1', 'g1', s0, buildSeats(), { roomCode: 'ABCDEF', logger });
    const recA = makeRecorder();
    const recB = makeRecorder();
    room.attach(0, recA.send);
    room.attach(1, recB.send);

    // attach → presence broadcast
    const presenceCount = (rec: { log: ServerMsg[] }) =>
      rec.log.filter((m) => m.type === 'presence').length;
    expect(presenceCount(recA)).toBeGreaterThan(0);
    expect(presenceCount(recB)).toBeGreaterThan(0);

    const hash0 = room.getHash();

    // Seat 1 can't play on seat 0's turn.
    expect(
      room.applyIntent(1, { type: 'reinforce', territory: 'Alaska', count: 1 }),
    ).rejects.toBeInstanceOf(RoomError);

    // Walk seat 0 through reinforce.
    const cp = s0.players[s0.currentPlayerIdx]!;
    const ownedByCp = Object.keys(s0.territories).filter((n) => s0.territories[n]?.owner === cp.id);
    expect(ownedByCp.length).toBeGreaterThan(0);
    const firstOwned = ownedByCp[0]!;
    const reserves = cp.reserves;

    await room.applyIntent(0, {
      type: 'reinforce',
      territory: firstOwned,
      count: reserves,
    });

    const hash1 = room.getHash();
    expect(hash1).not.toBe(hash0);
    expect(room.getSeq()).toBe(1);
    expect(room.getState().phase).toBe('attack');

    // Both recorders saw one applied.
    const appliedA = recA.log.filter((m) => m.type === 'applied').length;
    const appliedB = recB.log.filter((m) => m.type === 'applied').length;
    expect(appliedA).toBe(1);
    expect(appliedB).toBe(1);

    // Skip attack → end-attack-phase. We won't have card because we didn't conquer.
    await room.applyIntent(0, { type: 'end-attack-phase' });
    expect(room.getState().phase).toBe('fortify');
    expect(room.getSeq()).toBe(2);

    // End turn (no fortify candidate required).
    await room.applyIntent(0, { type: 'end-turn' });

    // Now it should be seat 1's turn.
    expect(room.getState().currentPlayerIdx).toBe(1);
    expect(room.getSeq()).toBe(3);

    // Persistence logger got every action.
    expect(logCalls.length).toBe(3);
    expect(logCalls[0]!.seq).toBe(1);
    expect(logCalls[2]!.seq).toBe(3);

    // Hash chain is monotonic (distinct values).
    const appliedHashes = recA.log
      .filter((m): m is Extract<ServerMsg, { type: 'applied' }> => m.type === 'applied')
      .map((m) => m.nextHash);
    expect(new Set(appliedHashes).size).toBe(appliedHashes.length);
  });

  test('swallows persistence errors — server keeps running', async () => {
    const s0 = buildReinforcePhaseState();
    const logger: TurnLogger = {
      write: async () => {
        throw new Error('db down');
      },
    };
    const room = new Room('r2', 'g2', s0, buildSeats(), { roomCode: 'AAAAAA', logger });
    const rec = makeRecorder();
    room.attach(0, rec.send);
    room.attach(1, () => {});

    const cp = s0.players[s0.currentPlayerIdx]!;
    const first = Object.keys(s0.territories).find((n) => s0.territories[n]?.owner === cp.id)!;

    const res = await room.applyIntent(0, {
      type: 'reinforce',
      territory: first,
      count: cp.reserves,
    });
    expect(res.seq).toBe(1);
    expect(rec.log.some((m) => m.type === 'applied')).toBe(true);
  });
});

describe('Room.detach', () => {
  test('removes send fn and broadcasts presence', async () => {
    const s0 = buildReinforcePhaseState();
    const room = new Room('r3', 'g3', s0, buildSeats(), { roomCode: 'BBBBBB' });
    const rec = makeRecorder();
    room.attach(0, rec.send);
    room.attach(1, () => {});
    const beforeDetach = rec.log.length;
    room.detach(1);
    // seat 0 should have received a presence:{seatIdx:1, connected:false}.
    const after = rec.log.slice(beforeDetach);
    const presence = after.find(
      (m): m is Extract<ServerMsg, { type: 'presence' }> => m.type === 'presence',
    );
    expect(presence).toBeDefined();
    expect(presence!.seatIdx).toBe(1);
    expect(presence!.connected).toBe(false);
  });
});
