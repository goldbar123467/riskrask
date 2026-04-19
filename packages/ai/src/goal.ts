/**
 * Campaign goals — ported from v2 `const Goal`.
 * Goal assignment (RNG-driven), progress tracking, bonus scoring.
 */

import type { GameState, PlayerId, TerritoryName } from '@riskrask/engine';
import { CONTINENTS, TERR_ORDER, ownedBy } from '@riskrask/engine';
import type { Rng } from '@riskrask/engine';
import { nextInt } from '@riskrask/engine';
import type { ArchDef } from './arch.js';

export const GoalTypes = {
  HOLD_CONTINENT: 'hold-continent',
  ELIMINATE_FIRST: 'eliminate-first',
  SURVIVE_WITH: 'survive-with',
  BREAK_BONUSES: 'break-bonuses',
  CAPTURE_CAPITAL: 'capture-capital',
} as const;

export type GoalType = (typeof GoalTypes)[keyof typeof GoalTypes];

export interface GoalHoldContinent {
  readonly type: 'hold-continent';
  readonly params: { readonly continent: string; readonly byTurn: number };
}
export interface GoalEliminateFirst {
  readonly type: 'eliminate-first';
  readonly params: Record<string, never>;
}
export interface GoalSurviveWith {
  readonly type: 'survive-with';
  readonly params: { readonly turn: number; readonly minTerritories: number };
}
export interface GoalBreakBonuses {
  readonly type: 'break-bonuses';
  readonly params: { readonly count: number };
}
export interface GoalCaptureCapital {
  readonly type: 'capture-capital';
  readonly params: { readonly territory: TerritoryName };
}

export type Goal =
  | GoalHoldContinent
  | GoalEliminateFirst
  | GoalSurviveWith
  | GoalBreakBonuses
  | GoalCaptureCapital;

function randomContinent(rng: Rng): string {
  const ids = Object.keys(CONTINENTS);
  return ids[nextInt(rng, ids.length)] ?? 'NA';
}

export function assignGoal(arch: ArchDef, rng: Rng): Goal {
  const bias = arch.goalBias;
  const cont = arch.preferredContinent ?? randomContinent(rng);
  switch (bias) {
    case 'holdContinent':
      return {
        type: GoalTypes.HOLD_CONTINENT,
        params: { continent: cont, byTurn: 10 + nextInt(rng, 5) },
      };
    case 'eliminateFirst':
      return { type: GoalTypes.ELIMINATE_FIRST, params: {} };
    case 'survive':
      return {
        type: GoalTypes.SURVIVE_WITH,
        params: { turn: 15, minTerritories: 8 + nextInt(rng, 4) },
      };
    case 'breakBonuses':
      return {
        type: GoalTypes.BREAK_BONUSES,
        params: { count: 2 + nextInt(rng, 2) },
      };
    default: {
      const roll = nextInt(rng, 10);
      if (roll < 4)
        return {
          type: GoalTypes.HOLD_CONTINENT,
          params: { continent: cont, byTurn: 12 },
        };
      if (roll < 7)
        return {
          type: GoalTypes.SURVIVE_WITH,
          params: { turn: 12, minTerritories: 10 },
        };
      return { type: GoalTypes.ELIMINATE_FIRST, params: {} };
    }
  }
}

export function goalProgress(
  state: GameState,
  playerId: PlayerId,
  goal: Goal,
  goalProgressCount: number,
): number {
  switch (goal.type) {
    case GoalTypes.HOLD_CONTINENT: {
      const members = CONTINENTS[goal.params.continent]?.members ?? [];
      const owned = members.filter((n) => state.territories[n]?.owner === playerId).length;
      return members.length > 0 ? owned / members.length : 0;
    }
    case GoalTypes.ELIMINATE_FIRST:
      return state.players.some((p) => p.eliminated) ? 1.0 : 0;
    case GoalTypes.SURVIVE_WITH: {
      const t = state.turn;
      const owned = ownedBy(state, playerId).length;
      return Math.min(1, t / goal.params.turn) * Math.min(1, owned / goal.params.minTerritories);
    }
    case GoalTypes.BREAK_BONUSES:
      return Math.min(1, goalProgressCount / goal.params.count);
    case GoalTypes.CAPTURE_CAPITAL:
      return state.territories[goal.params.territory]?.owner === playerId ? 1 : 0;
  }
}

export function isGoalComplete(
  state: GameState,
  playerId: PlayerId,
  goal: Goal,
  goalProgressCount: number,
): boolean {
  if (goal.type === GoalTypes.HOLD_CONTINENT) {
    return (
      goalProgress(state, playerId, goal, goalProgressCount) >= 1 &&
      state.turn <= goal.params.byTurn
    );
  }
  if (goal.type === GoalTypes.SURVIVE_WITH) {
    return (
      state.turn >= goal.params.turn &&
      ownedBy(state, playerId).length >= goal.params.minTerritories
    );
  }
  return goalProgress(state, playerId, goal, goalProgressCount) >= 1;
}

export interface GoalActionContext {
  readonly kind: 'attack' | 'reinforce';
  readonly target?: TerritoryName;
  readonly name?: TerritoryName;
}

export function goalBonus(
  state: GameState,
  playerId: PlayerId,
  goal: Goal,
  goalWeight: number,
  action: GoalActionContext,
): number {
  if (action.kind === 'attack' && action.target) {
    const tgt = state.territories[action.target];
    if (!tgt) return 0;
    if (goal.type === GoalTypes.HOLD_CONTINENT) {
      if (tgt.continent === goal.params.continent) return 25 * goalWeight;
    }
    if (goal.type === GoalTypes.ELIMINATE_FIRST) {
      const oppId = tgt.owner;
      if (oppId) {
        const oppTerrs = ownedBy(state, oppId);
        if (oppTerrs.length <= 2) return 35 * goalWeight;
      }
    }
    if (goal.type === GoalTypes.BREAK_BONUSES) {
      const tgtCont = tgt.continent;
      const contMembers = CONTINENTS[tgtCont]?.members ?? [];
      const defenderId = tgt.owner;
      if (
        defenderId != null &&
        contMembers.every((n) => state.territories[n]?.owner === defenderId)
      ) {
        return 30 * goalWeight;
      }
    }
    if (goal.type === GoalTypes.CAPTURE_CAPITAL && action.target === goal.params.territory) {
      return 50 * goalWeight;
    }
  }
  if (action.kind === 'reinforce' && action.name) {
    const t = state.territories[action.name];
    if (!t) return 0;
    if (goal.type === GoalTypes.HOLD_CONTINENT) {
      if (t.continent === goal.params.continent) return 10 * goalWeight;
    }
    if (goal.type === GoalTypes.SURVIVE_WITH) {
      const enemyCount = t.adj.filter((a) => state.territories[a]?.owner !== playerId).length;
      if (enemyCount > 1) return 8 * goalWeight;
    }
  }
  return 0;
}

/**
 * Called after a territory capture; increments goalProgressCount if the attacker
 * has a BREAK_BONUSES goal and this capture broke a continent bonus.
 */
export function onCaptureGoalUpdate(
  state: GameState,
  attackerGoal: Goal | null,
  tgtName: TerritoryName,
  currentCount: number,
): number {
  if (!attackerGoal || attackerGoal.type !== GoalTypes.BREAK_BONUSES) return currentCount;
  const tgtCont = state.territories[tgtName]?.continent;
  if (!tgtCont) return currentCount;
  const contMembers = CONTINENTS[tgtCont]?.members ?? [];
  const owners = new Set(contMembers.map((n) => state.territories[n]?.owner));
  if (owners.size > 1) return currentCount + 1;
  return currentCount;
}

export const Goal = {
  GoalTypes,
  assign: assignGoal,
  progress: goalProgress,
  isComplete: isGoalComplete,
  bonus: goalBonus,
  onCapture: onCaptureGoalUpdate,
};
