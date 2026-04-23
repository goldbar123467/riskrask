import { describe, expect, it } from 'bun:test';
import { apply, createInitialState, hashState } from '../src';

describe('RNG determinism', () => {
  it('same seed + same action sequence -> identical final hash', () => {
    function run() {
      let state = createInitialState({
        seed: 'deterministic-golden',
        players: [
          { id: 'p1', name: 'P1', color: '#f00', isAI: false },
          { id: 'p2', name: 'P2', color: '#0f0', isAI: true },
          { id: 'p3', name: 'P3', color: '#00f', isAI: true },
        ],
      });
      while (state.phase === 'setup-claim') {
        const free = Object.entries(state.territories).find(([, t]) => t.owner === null);
        if (!free) break;
        state = apply(state, { type: 'claim-territory', territory: free[0] }).next;
      }
      while (state.phase === 'setup-reinforce') {
        const cp = state.players[state.currentPlayerIdx];
        if (!cp) break;
        const owned = Object.entries(state.territories).find(([, t]) => t.owner === cp.id);
        if (!owned) break;
        state = apply(state, { type: 'setup-reinforce', territory: owned[0] }).next;
      }
      return hashState(state);
    }
    const a = run();
    const b = run();
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]+$/);
  });
});
