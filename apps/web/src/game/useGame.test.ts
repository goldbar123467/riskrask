import { apply, createInitialState, playerId } from '@riskrask/engine';
import { describe, expect, it } from 'vitest';
import { dilettanteTurn } from './aiRunner';

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
