import { describe, expect, it } from 'bun:test';
import { apply, createInitialState } from '../src';

describe('reinforce auto-advance', () => {
  it('transitions to attack phase when the final reserve is placed', () => {
    // 3 players, deterministic seed; manually drive out of setup.
    let state = createInitialState({
      seed: 'seed-reinforce-autoadvance',
      players: [
        { id: 'p1', name: 'P1', color: '#f00', isAI: false },
        { id: 'p2', name: 'P2', color: '#0f0', isAI: true },
        { id: 'p3', name: 'P3', color: '#00f', isAI: true },
      ],
    });
    // Claim all 42 territories round-robin.
    while (state.phase === 'setup-claim') {
      const free = Object.entries(state.territories).find(([, t]) => t.owner === null);
      if (!free) break;
      state = apply(state, { type: 'claim-territory', territory: free[0] }).next;
    }
    // Drain setup-reinforce for every player until phase flips to reinforce.
    while (state.phase === 'setup-reinforce') {
      const player = state.players[state.currentPlayerIdx];
      if (!player) break;
      const owned = Object.entries(state.territories).find(([, t]) => t.owner === player.id);
      if (!owned) break;
      state = apply(state, { type: 'setup-reinforce', territory: owned[0] }).next;
    }
    expect(state.phase).toBe('reinforce');
    const cp = state.players[state.currentPlayerIdx];
    expect(cp).toBeDefined();
    const owned = Object.entries(state.territories).find(([, t]) => t.owner === cp!.id);
    expect(owned).toBeDefined();
    const reserves = cp!.reserves;
    // Place ALL remaining reserves in one action.
    state = apply(state, {
      type: 'reinforce',
      territory: owned![0],
      count: reserves,
    }).next;
    expect(state.phase).toBe('attack');
    expect(state.players[state.currentPlayerIdx]!.reserves).toBe(0);
  });
});
