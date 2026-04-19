import { describe, expect, test } from 'bun:test';
import { Arch } from '../src/arch.js';
import { createPersonaState } from '../src/persona.js';
import { Plan } from '../src/plan.js';
import { buildMidgameState, P0 } from './helpers.js';

describe('Plan', () => {
  test('composePlan returns a TurnPlan', () => {
    const state = buildMidgameState();
    const ps = createPersonaState(Arch.get('napoleon')!);
    const plan = Plan.compose(state, P0, ps);
    expect(plan).toBeDefined();
    expect(['aggressive', 'defensive']).toContain(plan.kind);
    expect(plan.turn).toBe(state.turn);
  });

  test('composePlan reinforceFocus is an owned territory', () => {
    const state = buildMidgameState();
    const ps = createPersonaState(Arch.get('napoleon')!);
    const plan = Plan.compose(state, P0, ps);
    if (plan.reinforceFocus) {
      expect(state.territories[plan.reinforceFocus]?.owner).toBe(P0);
    }
  });

  test('composePlan primary attack source is owned', () => {
    const state = buildMidgameState();
    const ps = createPersonaState(Arch.get('napoleon')!);
    const plan = Plan.compose(state, P0, ps);
    if (plan.primary) {
      expect(state.territories[plan.primary.source]?.owner).toBe(P0);
      expect(state.territories[plan.primary.target]?.owner).not.toBe(P0);
    }
  });

  test('evaluatePlan returns neutral for null primary', () => {
    const state = buildMidgameState();
    const plan = { kind: 'defensive' as const, primary: null, reinforceFocus: null, turn: 0 };
    expect(Plan.evaluate(state, P0, plan)).toBe('neutral');
  });

  test('evaluatePlan returns success when target is now owned', () => {
    const state = buildMidgameState();
    // Find a P0-owned territory
    const owned = Object.entries(state.territories).filter(([, t]) => t.owner === P0);
    if (owned.length < 2) return;
    const [firstTerr] = owned[0]!;
    const [secondTerr] = owned[1]!;
    const plan = {
      kind: 'aggressive' as const,
      primary: { source: firstTerr, target: secondTerr, score: 10 },
      reinforceFocus: null,
      turn: 0,
    };
    // P0 owns secondTerr → success
    expect(Plan.evaluate(state, P0, plan)).toBe('success');
  });
});
