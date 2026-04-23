import { describe, expect, it } from 'bun:test';
import { createInitialState, createRng } from '@riskrask/engine';
import { takeSetupAction } from '../src/setup';

describe('takeSetupAction', () => {
  it('returns a claim-territory action during setup-claim', () => {
    const state = createInitialState({
      seed: 'setup-test-1',
      players: [
        { id: 'p1', name: 'P1', color: '#f00', isAI: false },
        { id: 'p2', name: 'P2', color: '#0f0', isAI: true },
        { id: 'p3', name: 'P3', color: '#00f', isAI: true },
      ],
    });
    const actions = takeSetupAction(state, 'p1', createRng('rng-1'));
    expect(actions.length).toBe(1);
    expect(actions[0]?.type).toBe('claim-territory');
  });

  it('returns empty when no unowned territories remain', () => {
    const state = createInitialState({
      seed: 'setup-test-2',
      players: [
        { id: 'p1', name: 'P1', color: '#f00', isAI: false },
        { id: 'p2', name: 'P2', color: '#0f0', isAI: true },
        { id: 'p3', name: 'P3', color: '#00f', isAI: true },
      ],
    });
    // Synthesize a fully-claimed territory map.
    const fullyClaimed = {
      ...state,
      territories: Object.fromEntries(
        Object.entries(state.territories).map(([k, v]) => [k, { ...v, owner: 'p1' }]),
      ),
    };
    const actions = takeSetupAction(fullyClaimed as never, 'p1', createRng('rng-2'));
    expect(actions).toEqual([]);
  });

  it('returns empty for non-setup phases', () => {
    const state = createInitialState({
      seed: 'setup-test-3',
      players: [
        { id: 'p1', name: 'P1', color: '#f00', isAI: false },
        { id: 'p2', name: 'P2', color: '#0f0', isAI: true },
        { id: 'p3', name: 'P3', color: '#00f', isAI: true },
      ],
    });
    const reinforceState = { ...state, phase: 'reinforce' as const };
    expect(takeSetupAction(reinforceState, 'p1', createRng('r'))).toEqual([]);
    const attackState = { ...state, phase: 'attack' as const };
    expect(takeSetupAction(attackState, 'p1', createRng('r'))).toEqual([]);
  });
});
