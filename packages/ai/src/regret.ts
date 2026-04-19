/**
 * Regret — in-game learning. Ported from v2 `const Regret`.
 * Updates runtime weights based on deviation from expected loss tables.
 */

import type { ArchDef } from './arch.js';
import type { PersonaState } from './persona.js';

// Expected loss table ported verbatim from v2
const EXPECTED_LOSS: Readonly<Record<string, { atkLoss: number; defLoss: number }>> = Object.freeze({
  '1,1': { atkLoss: 0.583, defLoss: 0.417 },
  '2,1': { atkLoss: 0.421, defLoss: 0.579 },
  '3,1': { atkLoss: 0.340, defLoss: 0.660 },
  '1,2': { atkLoss: 0.745, defLoss: 0.255 },
  '2,2': { atkLoss: 0.896, defLoss: 1.104 },
  '3,2': { atkLoss: 0.742, defLoss: 1.258 },
});

export function expectedLoss(
  atkDiceCount: number,
  defDiceCount: number,
): { atkLoss: number; defLoss: number } {
  return EXPECTED_LOSS[`${atkDiceCount},${defDiceCount}`] ?? { atkLoss: 1, defLoss: 1 };
}

function clampNum(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Returns an updated PersonaState with adjusted runtime weights. */
export function updateRegret(
  ps: PersonaState,
  arch: ArchDef,
  atkDiceCount: number,
  defDiceCount: number,
  actualAtkLoss: number,
  actualDefLoss: number,
): PersonaState {
  const exp = expectedLoss(atkDiceCount, defDiceCount);
  const atkRegret = actualAtkLoss - exp.atkLoss;
  const defShortfall = exp.defLoss - actualDefLoss;
  const la = arch.lossAversion;
  const combined = atkRegret * la + defShortfall * 0.5;

  const baseW = arch.weights.attack;
  const w = { ...ps.runtimeWeights.attack };
  w.hopelessPenalty = clampNum(
    w.hopelessPenalty + 0.05 * combined,
    baseW.hopelessPenalty * 0.7,
    baseW.hopelessPenalty * 1.6,
  );
  w.armyAdvantage = clampNum(
    w.armyAdvantage - 0.03 * combined,
    baseW.armyAdvantage * 0.6,
    baseW.armyAdvantage * 1.4,
  );

  const baseT = arch.temperature;
  const newAccum = clampNum(
    (ps.regretTempAccum) + 0.04 * -combined,
    -baseT * 0.5,
    baseT * 0.6,
  );

  return {
    ...ps,
    runtimeWeights: {
      ...ps.runtimeWeights,
      attack: w,
    },
    regretTempAccum: newAccum,
  };
}

/** Reset runtime weights back to archetype baseline. */
export function resetRegret(ps: PersonaState, arch: ArchDef): PersonaState {
  return {
    ...ps,
    runtimeWeights: {
      reinforce: { ...arch.weights.reinforce },
      attack: { ...arch.weights.attack },
    },
    runtimeTemperature: arch.temperature,
    regretTempAccum: 0,
  };
}

export const Regret = {
  update: updateRegret,
  reset: resetRegret,
  expectedLoss,
  EXPECTED_LOSS,
};
