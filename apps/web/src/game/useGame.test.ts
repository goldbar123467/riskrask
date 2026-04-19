import { apply, createInitialState, playerId } from '@riskrask/engine';
import { describe, expect, it } from 'vitest';
import { dilettanteTurn } from './aiRunner';

function runGame(seed: string): string | undefined {
  let state = createInitialState({
    seed,
    players: [
      { id: playerId('a'), name: 'Alpha', color: '#4f7dd4', isAI: true },
      { id: playerId('b'), name: 'Bravo', color: '#c94a4a', isAI: true },
      { id: playerId('c'), name: 'Charlie', color: '#d4a24a', isAI: true },
    ],
  });

  let steps = 0;
  const MAX = 60_000;

  while (state.phase !== 'done' && steps < MAX) {
    const cp = state.players[state.currentPlayerIdx];
    if (!cp) break;

    const actions = dilettanteTurn(state, cp.id);
    if (actions.length === 0) break;

    for (const action of actions) {
      try {
        const result = apply(state, action);
        state = result.next;
        // Auto-resolve pending move with minimum
        if (state.pendingMove && state.phase !== 'done') {
          const { min } = state.pendingMove;
          state = apply(state, { type: 'move-after-capture', count: min }).next;
        }
      } catch {
        // AI occasionally generates invalid actions; skip
      }
      if (state.phase === 'done') break;
    }
    steps++;
  }

  return state.winner;
}

describe('dilettanteTurn + engine integration', () => {
  it('3-AI game reaches done phase within step limit (seed solo-test-1)', () => {
    let state = createInitialState({
      seed: 'solo-test-1',
      players: [
        { id: playerId('a'), name: 'A', color: '#4f7dd4', isAI: true },
        { id: playerId('b'), name: 'B', color: '#c94a4a', isAI: true },
        { id: playerId('c'), name: 'C', color: '#d4a24a', isAI: true },
      ],
    });

    let steps = 0;
    while (state.phase !== 'done' && steps < 60_000) {
      const cp = state.players[state.currentPlayerIdx];
      if (!cp) break;
      const actions = dilettanteTurn(state, cp.id);
      if (actions.length === 0) break;
      for (const action of actions) {
        try {
          state = apply(state, action).next;
          if (state.pendingMove && state.phase !== 'done') {
            state = apply(state, { type: 'move-after-capture', count: state.pendingMove.min }).next;
          }
        } catch { /* skip invalid AI actions */ }
        if (state.phase === 'done') break;
      }
      steps++;
    }

    expect(state.phase).toBe('done');
    expect(state.winner).toBeTruthy();
  }, 30_000);

  it('produces same winner on two runs with same seed (determinism)', () => {
    const w1 = runGame('solo-test-1');
    const w2 = runGame('solo-test-1');
    expect(w1).toBeTruthy();
    expect(w1).toBe(w2);
  }, 60_000);
});
