/**
 * Rule — per-archetype mechanical asymmetry. Ported from v2 `const Rule`.
 * canAttack, reinforceBonus, rerollAtkDie — all pure.
 */

import type { GameState, TerritoryName } from '@riskrask/engine';
import type { Rng } from '@riskrask/engine';
import { nextInt } from '@riskrask/engine';
import type { ArchDef } from './arch.js';

export function reinforceBonus(arch: ArchDef | null | undefined, attacksLastTurn: number): number {
  if (!arch?.ruleMods) return 0;
  const base = arch.ruleMods.reinforceBonus ?? 0;
  const lossPerAttack = arch.ruleMods.reinforceLossPerAttack ?? 0;
  return base - lossPerAttack * attacksLastTurn;
}

export function canAttack(
  state: GameState,
  arch: ArchDef | null | undefined,
  srcName: TerritoryName,
): boolean {
  if (!arch?.ruleMods) return true;
  const minStack = arch.ruleMods.minAttackStack;
  if (minStack != null && (state.territories[srcName]?.armies ?? 0) < minStack) return false;
  const noBefore = arch.ruleMods.noAttackBeforeTurn;
  if (noBefore != null && state.turn < noBefore) return false;
  return true;
}

/**
 * rerollAtkDie — if `rerollOneLoss` is set, tries to reroll the worst losing attacker die.
 * Returns the (possibly modified) sorted-descending attacker dice.
 * Uses RNG so it is deterministic.
 */
export function rerollAtkDie(
  arch: ArchDef | null | undefined,
  atkDice: readonly number[],
  defDice: readonly number[],
  rng: Rng,
): number[] {
  if (!arch?.ruleMods?.rerollOneLoss) return atkDice.slice();
  const a = atkDice.slice().sort((x, y) => y - x);
  const d = defDice.slice().sort((x, y) => y - x);
  for (let i = 0; i < Math.min(a.length, d.length); i++) {
    if ((a[i] ?? 0) <= (d[i] ?? 0)) {
      const newRoll = nextInt(rng, 6) + 1;
      if (newRoll > (a[i] ?? 0)) {
        a[i] = newRoll;
        return a.sort((x, y) => y - x);
      }
      break;
    }
  }
  return a;
}

export const Rule = {
  reinforceBonus,
  canAttack,
  rerollAtkDie,
};
