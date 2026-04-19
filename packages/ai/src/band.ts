/**
 * Band — rubber-band temperature. Ported from v2 `const Band`.
 * standing() computes [-1, 1] position; recalibrate() adjusts runtimeTemperature.
 */

import type { GameState, PlayerId } from '@riskrask/engine';
import { CONTINENTS, TERR_ORDER, ownedBy, ownedContinents } from '@riskrask/engine';
import type { ArchDef } from './arch.js';
import type { PersonaState } from './persona.js';

/** Compute a player's standing in [-1, 1]. Mirrors v2 `Band.standing`. */
export function standing(state: GameState, playerId: PlayerId): number {
  const p = state.players.find((p) => p.id === playerId);
  if (!p || p.eliminated) return -1;
  const alive = state.players.filter((p) => !p.eliminated);
  if (alive.length <= 1) return 0;

  const myT = ownedBy(state, playerId).length;
  const totalT = TERR_ORDER.length;
  const avgT = totalT / alive.length;

  const myA = TERR_ORDER.reduce(
    (s, n) =>
      s + (state.territories[n]?.owner === playerId ? (state.territories[n]?.armies ?? 0) : 0),
    0,
  );
  const totalA = TERR_ORDER.reduce((s, n) => s + (state.territories[n]?.armies ?? 0), 0);
  const avgA = totalA / alive.length;

  const myC = ownedContinents(state, playerId).reduce((s, c) => s + (CONTINENTS[c]?.bonus ?? 0), 0);
  const totalC = Object.keys(CONTINENTS).reduce((s, c) => s + (CONTINENTS[c]?.bonus ?? 0), 0);
  const avgC = totalC / alive.length;

  const tD = avgT > 0 ? (myT - avgT) / avgT : 0;
  const aD = avgA > 0 ? (myA - avgA) / avgA : 0;
  const cD = avgC > 0 ? (myC - avgC) / avgC : 0;
  return Math.max(-1, Math.min(1, 0.4 * tD + 0.4 * aD + 0.2 * cD));
}

/** Recalibrate runtimeTemperature for a single player. Returns updated PersonaState. */
export function recalibrate(
  state: GameState,
  ps: PersonaState,
  arch: ArchDef,
  playerId: PlayerId,
): PersonaState {
  const s = standing(state, playerId);
  const baseT = arch.temperature;
  const rb = arch.rubberBand;
  const delta = s > 0 ? rb.leaderBonus * s : rb.trailerBonus * -s;
  const newT = Math.max(0.1, baseT + delta + ps.regretTempAccum);
  return { ...ps, runtimeTemperature: newT };
}

export const Band = {
  standing,
  recalibrate,
};
