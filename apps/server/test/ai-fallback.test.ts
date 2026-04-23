/**
 * AI fallback — unit-level.
 *
 * Builds a Room where seat 1 is flagged AFK, invokes the fallback with a
 * stubbed `takeTurn` that returns a fixed action sequence, and verifies:
 *   - `ai-takeover` broadcast fires before the first applied
 *   - each applied broadcast follows in order with advancing seq
 *   - the fallback stops cleanly once the current-seat changes
 */

import { beforeAll, describe, expect, test } from 'bun:test';

beforeAll(() => {
  process.env.SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://stub.local';
  process.env.SUPABASE_SERVICE_ROLE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'service-stub-key';
  process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? 'anon-stub-key';
});

import { TERR_ORDER, apply, createInitialState } from '@riskrask/engine';
import type { Action, GameState } from '@riskrask/engine';
import type { ServerMsg } from '@riskrask/shared';
import { runFallbackTurn } from '../src/ai/fallback';
import { Room } from '../src/rooms/Room';
import type { Seat } from '../src/rooms/seat';

const PLAYERS = [
  { id: '0', name: 'Alice', color: '#dc2626', isAI: false },
  { id: '1', name: 'Bob', color: '#2563eb', isAI: false },
];

function buildReinforcePhaseOnSeat1(): GameState {
  let s = createInitialState({ seed: 'fallback-test', players: PLAYERS });
  for (const name of TERR_ORDER) {
    s = apply(s, { type: 'claim-territory', territory: name }).next;
  }
  while (s.phase === 'setup-reinforce') {
    const cp = s.players[s.currentPlayerIdx]!;
    const owned = Object.keys(s.territories).find((n) => s.territories[n]?.owner === cp.id)!;
    s = apply(s, { type: 'setup-reinforce', territory: owned }).next;
  }
  // Now we're in main reinforce phase on seat 0. Burn seat 0's turn so seat 1
  // is the current player.
  const cp0 = s.players[s.currentPlayerIdx]!;
  const owned0 = Object.keys(s.territories).find((n) => s.territories[n]?.owner === cp0.id)!;
  s = apply(s, { type: 'reinforce', territory: owned0, count: cp0.reserves }).next;
  s = apply(s, { type: 'end-attack-phase' }).next;
  s = apply(s, { type: 'end-turn' }).next;
  return s;
}

function seats(): Seat[] {
  return [
    { seatIdx: 0, userId: 'u-a', isAi: false, archId: null, connected: true, afk: false },
    { seatIdx: 1, userId: 'u-b', isAi: false, archId: null, connected: false, afk: true },
  ];
}

describe('runFallbackTurn', () => {
  test('broadcasts ai-takeover before appliedand drives each action', async () => {
    const state = buildReinforcePhaseOnSeat1();
    expect(state.currentPlayerIdx).toBe(1);

    const room = new Room('r-f1', 'g-f1', state, seats(), { roomCode: 'FFFFFF' });
    const log: ServerMsg[] = [];
    room.attach(0, (m) => log.push(m));
    room.attach(1, () => {});

    const cp = state.players[1]!;
    const ownedByCp = Object.keys(state.territories).filter(
      (n) => state.territories[n]?.owner === cp.id,
    );
    expect(ownedByCp.length).toBeGreaterThan(0);
    const target = ownedByCp[0]!;

    // Stubbed takeTurn: reinforce all reserves onto one territory, end attack
    // phase, end turn. This mirrors what a no-op persona would do.
    const stubbed = (): Action[] => [
      { type: 'reinforce', territory: target, count: cp.reserves },
      { type: 'end-attack-phase' },
      { type: 'end-turn' },
    ];

    await runFallbackTurn(room, 1, stubbed);

    // ai-takeover appears in the log before the first applied.
    const takeoverIdx = log.findIndex((m) => m.type === 'ai-takeover');
    const firstAppliedIdx = log.findIndex((m) => m.type === 'applied');
    expect(takeoverIdx).toBeGreaterThanOrEqual(0);
    expect(firstAppliedIdx).toBeGreaterThan(takeoverIdx);

    const applied = log.filter(
      (m): m is Extract<ServerMsg, { type: 'applied' }> => m.type === 'applied',
    );
    expect(applied.length).toBe(3);
    // seqs are monotonic.
    expect(applied[0]!.seq).toBe(1);
    expect(applied[1]!.seq).toBe(2);
    expect(applied[2]!.seq).toBe(3);

    // Turn has advanced away from seat 1.
    expect(room.getState().currentPlayerIdx).toBe(0);
  });

  test('stops cleanly when takeTurn returns no actions', async () => {
    const state = buildReinforcePhaseOnSeat1();
    const room = new Room('r-f2', 'g-f2', state, seats(), { roomCode: 'FFFFF2' });
    room.attach(0, () => {});
    room.attach(1, () => {});

    const calls: number[] = [];
    const stubbed = (): Action[] => {
      calls.push(1);
      return [];
    };

    await runFallbackTurn(room, 1, stubbed);
    // Called exactly once and then bailed.
    expect(calls.length).toBe(1);
    // State unchanged.
    expect(room.getSeq()).toBe(0);
  });

  test('drives a claim-territory action during setup-claim', async () => {
    // Fresh setup state — seat 0 is current. Burn one claim so seat 1 is up.
    let s = createInitialState({ seed: 'fallback-setup', players: PLAYERS });
    expect(s.phase).toBe('setup-claim');
    expect(s.currentPlayerIdx).toBe(0);

    const firstUnowned = Object.keys(s.territories).find((n) => s.territories[n]?.owner === null)!;
    s = apply(s, { type: 'claim-territory', territory: firstUnowned }).next;
    expect(s.currentPlayerIdx).toBe(1);
    expect(s.phase).toBe('setup-claim');

    const room = new Room('r-f3', 'g-f3', s, seats(), { roomCode: 'FFFFF3' });
    const log: ServerMsg[] = [];
    room.attach(0, (m) => log.push(m));
    room.attach(1, () => {});

    // Pass a stub that would fail the test if reached — the setup path
    // should bypass takeTurn entirely and use takeSetupAction.
    const stubbed = (): Action[] => {
      throw new Error('takeTurn should not be called during setup-claim');
    };

    const seatsBefore = Object.values(room.getState().territories).filter(
      (t) => t.owner === '1',
    ).length;

    await runFallbackTurn(room, 1, stubbed);

    const after = room.getState();
    // Seat 1 now owns one more territory (they claimed exactly one).
    const seatsAfter = Object.values(after.territories).filter((t) => t.owner === '1').length;
    expect(seatsAfter).toBe(seatsBefore + 1);

    // One applied frame + one ai-takeover broadcast, in order.
    const takeoverIdx = log.findIndex((m) => m.type === 'ai-takeover');
    const appliedMsgs = log.filter(
      (m): m is Extract<ServerMsg, { type: 'applied' }> => m.type === 'applied',
    );
    expect(takeoverIdx).toBeGreaterThanOrEqual(0);
    expect(appliedMsgs.length).toBe(1);
    // The applied action is a claim-territory.
    const appliedAction = appliedMsgs[0]!.action as Action;
    expect(appliedAction.type).toBe('claim-territory');

    // Engine round-robin moves to next seat after a claim.
    expect(after.currentPlayerIdx).not.toBe(1);
  });
});
