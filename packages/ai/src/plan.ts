/**
 * Plan — telegraphed intent. Ported from v2 `const Plan`.
 * compose() derives this turn's intent from game state.
 * evaluate() assesses whether last turn's plan worked.
 */

import type { GameState, PlayerId, TerritoryName } from '@riskrask/engine';
import { ownedBy } from '@riskrask/engine';
import type { PersonaState } from './persona.js';
import { scoreAttack, scoreReinforce } from './persona.js';

export interface AttackIntent {
  readonly source: TerritoryName;
  readonly target: TerritoryName;
  readonly score: number;
}

export interface TurnPlan {
  readonly kind: 'aggressive' | 'defensive';
  readonly primary: AttackIntent | null;
  readonly reinforceFocus: TerritoryName | null;
  readonly turn: number;
}

/** Compose a plan for the given player. Mirrors v2 `Plan.compose`. */
export function composePlan(
  state: GameState,
  playerId: PlayerId,
  ps: PersonaState | null | undefined,
): TurnPlan {
  const owned = ownedBy(state, playerId);
  const options: AttackIntent[] = [];
  for (const src of owned) {
    const sT = state.territories[src];
    if (!sT || sT.armies < 3) continue;
    for (const adj of sT.adj) {
      if (state.territories[adj]?.owner !== playerId) {
        const s = scoreAttack(state, src, adj as TerritoryName, playerId, ps);
        options.push({ source: src, target: adj as TerritoryName, score: s });
      }
    }
  }
  options.sort((a, b) => b.score - a.score);
  const primary = options[0] ?? null;

  const reinforcePicks = owned.map((n) => ({
    name: n,
    score: scoreReinforce(state, n, playerId, ps),
  }));
  reinforcePicks.sort((a, b) => b.score - a.score);
  const reinforceFocus = reinforcePicks[0]?.name ?? null;

  return {
    kind: primary != null && primary.score > 0 ? 'aggressive' : 'defensive',
    primary,
    reinforceFocus,
    turn: state.turn,
  };
}

export type PlanOutcome = 'success' | 'thwarted' | 'disaster' | 'neutral';

/** Evaluate last turn's plan against current state. Mirrors v2 `Plan.evaluate`. */
export function evaluatePlan(state: GameState, playerId: PlayerId, plan: TurnPlan): PlanOutcome {
  if (!plan.primary) return 'neutral';
  const tgt = state.territories[plan.primary.target];
  if (!tgt) return 'neutral';
  if (tgt.owner === playerId) return 'success';
  const src = state.territories[plan.primary.source];
  if (src && src.armies < 2) return 'disaster';
  return 'thwarted';
}

export const Plan = {
  compose: composePlan,
  evaluate: evaluatePlan,
};
