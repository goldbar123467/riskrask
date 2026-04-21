import type { Effect } from '@riskrask/engine';
import { apply, createInitialState, playerId } from '@riskrask/engine';
import { describe, expect, it } from 'vitest';
import { dilettanteTurn } from './aiRunner';
import { type LogLine, PER_TURN_CAP, appendLog } from './useGame';

describe('dilettanteTurn', () => {
  it('generates valid actions in setup-claim phase', () => {
    const state = createInitialState({
      seed: 'test-1',
      players: [
        { id: playerId('a'), name: 'A', color: '#f00', isAI: true },
        { id: playerId('b'), name: 'B', color: '#0f0', isAI: true },
        { id: playerId('c'), name: 'C', color: '#00f', isAI: true },
      ],
    });
    const cp = state.players[state.currentPlayerIdx]!;
    const actions = dilettanteTurn(state, cp.id);
    expect(actions.length).toBeGreaterThan(0);
    // Applying the first action should succeed
    const result = apply(state, actions[0]!);
    expect(result.next.phase).not.toBeUndefined();
  });

  it('advances through setup phases without errors (100 steps)', () => {
    let state = createInitialState({
      seed: 'solo-test-1',
      players: [
        { id: playerId('a'), name: 'A', color: '#4f7dd4', isAI: true },
        { id: playerId('b'), name: 'B', color: '#c94a4a', isAI: true },
        { id: playerId('c'), name: 'C', color: '#d4a24a', isAI: true },
      ],
    });

    // Run 200 steps — should get through setup and into main game
    let steps = 0;
    const MAX = 200;
    while (steps < MAX && (state.phase === 'setup-claim' || state.phase === 'setup-reinforce')) {
      const cp = state.players[state.currentPlayerIdx];
      if (!cp) break;
      const actions = dilettanteTurn(state, cp.id);
      if (actions.length === 0) break;
      for (const action of actions) {
        try {
          state = apply(state, action).next;
          while (state.pendingMove) {
            state = apply(state, { type: 'move-after-capture', count: state.pendingMove.min }).next;
          }
        } catch {
          /* skip */
        }
        if (state.phase !== 'setup-claim' && state.phase !== 'setup-reinforce') break;
      }
      steps++;
    }
    // Should have moved past setup
    expect(['reinforce', 'attack', 'fortify', 'done']).toContain(state.phase);
  });

  it('is deterministic with same seed', () => {
    const state = createInitialState({
      seed: 'det-test',
      players: [
        { id: playerId('a'), name: 'A', color: '#f00', isAI: true },
        { id: playerId('b'), name: 'B', color: '#0f0', isAI: true },
        { id: playerId('c'), name: 'C', color: '#00f', isAI: true },
      ],
    });
    const cp = state.players[0]!;
    const actions1 = dilettanteTurn(state, cp.id);
    const actions2 = dilettanteTurn(state, cp.id);
    expect(JSON.stringify(actions1)).toBe(JSON.stringify(actions2));
  });
});

describe('appendLog per-turn cap', () => {
  function capture(to: string, from: string): Effect {
    return { kind: 'territory-captured', from: from as never, to: to as never };
  }

  it('keeps only the PER_TURN_CAP most recent entries for the current turn', () => {
    // Seed the log with 8 capture events on turn 5.
    let seeded: LogLine[] = [];
    for (let i = 0; i < 8; i++) {
      seeded = appendLog(seeded, [capture(`T${i}`, `F${i}`)], 5);
    }
    // After seeding we should already be capped at PER_TURN_CAP.
    expect(seeded.filter((l) => l.turn === 5).length).toBe(PER_TURN_CAP);

    // Append 3 more capture events for turn 5.
    let next = seeded;
    for (let i = 8; i < 11; i++) {
      next = appendLog(next, [capture(`T${i}`, `F${i}`)], 5);
    }

    // Only PER_TURN_CAP (6) entries for turn 5 remain — the newest ones.
    const turn5 = next.filter((l) => l.turn === 5);
    expect(turn5.length).toBe(PER_TURN_CAP);
    expect(turn5.map((l) => l.text)).toEqual([
      'T5 captured from F5.',
      'T6 captured from F6.',
      'T7 captured from F7.',
      'T8 captured from F8.',
      'T9 captured from F9.',
      'T10 captured from F10.',
    ]);
  });

  it('does not drop entries from other turns when capping the current turn', () => {
    // Fill turn 4 with 3 entries — these should stay untouched.
    let log: LogLine[] = [];
    for (let i = 0; i < 3; i++) {
      log = appendLog(log, [capture(`EarlyT${i}`, `EarlyF${i}`)], 4);
    }
    // Then spam turn 5 beyond PER_TURN_CAP.
    for (let i = 0; i < 11; i++) {
      log = appendLog(log, [capture(`LateT${i}`, `LateF${i}`)], 5);
    }
    const turn4 = log.filter((l) => l.turn === 4);
    const turn5 = log.filter((l) => l.turn === 5);
    expect(turn4.length).toBe(3);
    expect(turn5.length).toBe(PER_TURN_CAP);
  });
});
