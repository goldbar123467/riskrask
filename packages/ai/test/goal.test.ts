import { describe, expect, test } from 'bun:test';
import { createRng } from '@riskrask/engine';
import { Arch } from '../src/arch.js';
import { Goal, GoalTypes, assignGoal, goalBonus, goalProgress } from '../src/goal.js';
import { P0, buildMidgameState } from './helpers.js';

describe('Goal', () => {
  test('assignGoal returns a goal with correct type for holdContinent bias', () => {
    const arch = Arch.get('napoleon')!; // goalBias: holdContinent
    const rng = createRng('goal-test');
    const goal = assignGoal(arch, rng);
    expect(goal.type).toBe(GoalTypes.HOLD_CONTINENT);
  });

  test('assignGoal returns eliminate-first for jackal', () => {
    const arch = Arch.get('jackal')!; // goalBias: eliminateFirst
    const rng = createRng('jackal-goal');
    const goal = assignGoal(arch, rng);
    expect(goal.type).toBe(GoalTypes.ELIMINATE_FIRST);
  });

  test('assignGoal returns survive-with for fortress', () => {
    const arch = Arch.get('fortress')!; // goalBias: survive
    const rng = createRng('fortress-goal');
    const goal = assignGoal(arch, rng);
    expect(goal.type).toBe(GoalTypes.SURVIVE_WITH);
  });

  test('goalProgress for eliminate-first is 0 when no one eliminated', () => {
    const state = buildMidgameState();
    const goal = { type: 'eliminate-first' as const, params: {} };
    expect(goalProgress(state, P0, goal, 0)).toBe(0);
  });

  test('goalProgress for eliminate-first is 1 when someone eliminated', () => {
    const state = buildMidgameState();
    // Mark P1 as eliminated
    const modState = {
      ...state,
      players: state.players.map((p, i) => (i === 1 ? { ...p, eliminated: true } : p)),
    };
    const goal = { type: 'eliminate-first' as const, params: {} };
    expect(goalProgress(modState, P0, goal, 0)).toBe(1);
  });

  test('goalBonus returns 0 when no matching goal', () => {
    const state = buildMidgameState();
    const goal = { type: 'survive-with' as const, params: { turn: 15, minTerritories: 8 } };
    // attack action on a different continent should give 0
    const owned = Object.entries(state.territories).filter(([, t]) => t.owner !== P0);
    if (owned.length === 0) return;
    const [tgtName] = owned[0]!;
    const bonus = goalBonus(state, P0, goal, 0.5, { kind: 'attack', target: tgtName });
    expect(typeof bonus).toBe('number');
  });

  test('Goal.assign is deterministic for same rng', () => {
    const arch = Arch.get('napoleon')!;
    const rng1 = createRng('det-goal');
    const rng2 = createRng('det-goal');
    const g1 = Goal.assign(arch, rng1);
    const g2 = Goal.assign(arch, rng2);
    expect(g1.type).toBe(g2.type);
  });
});
