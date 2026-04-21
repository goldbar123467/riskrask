/**
 * Persona — weighted scoring + softmax decision.
 * Ported from v2 `const Persona` + `Decision.setPicker`.
 * All functions are pure: no globals, no Math.random.
 */

import type { GameState, PlayerId, TerritoryName } from '@riskrask/engine';
import { CONTINENTS, TERR_ORDER, ownedBy } from '@riskrask/engine';
import type { Rng } from '@riskrask/engine';
import { nextInt } from '@riskrask/engine';
import type { ArchDef, ArchWeights } from './arch.js';

/** Runtime weights — cloned from arch.weights at session start, mutated by Regret. */
export interface RuntimeWeights {
  reinforce: {
    adjEnemies: number;
    maxEnemyArmies: number;
    continentBorder: number;
    nearContinent: number;
    adjFriendly: number;
  };
  attack: {
    completeContinent: number;
    breakContinent: number;
    eliminate: number;
    armyAdvantage: number;
    hopelessPenalty: number;
  };
}

/** Per-player AI state carried alongside game state (not inside GameState). */
export interface PersonaState {
  readonly archId: string;
  runtimeWeights: RuntimeWeights;
  runtimeTemperature: number;
  regretTempAccum: number;
  /** stack of recent event names (up to 3) */
  recentEvents: string[];
}

export function createPersonaState(arch: ArchDef): PersonaState {
  return {
    archId: arch.id,
    runtimeWeights: {
      reinforce: { ...arch.weights.reinforce },
      attack: { ...arch.weights.attack },
    },
    runtimeTemperature: arch.temperature,
    regretTempAccum: 0,
    recentEvents: [],
  };
}

/** Safe weight accessor — mirrors v2 `Persona.w(player, path)`. */
export function getWeight(
  ps: PersonaState | null | undefined,
  section: keyof ArchWeights,
  key: string,
): number {
  if (!ps) return 1.0;
  const weights = ps.runtimeWeights as unknown as Record<string, Record<string, number>>;
  return (weights[section as string] as Record<string, number> | undefined)?.[key] ?? 1.0;
}

export function getTemperature(ps: PersonaState | null | undefined): number {
  if (!ps) return 1.0;
  return Math.max(0.1, ps.runtimeTemperature);
}

export function getMistakeRate(
  ps: PersonaState | null | undefined,
  arch: ArchDef | null,
  turn: number,
): number {
  if (!ps || !arch) return 0;
  return Math.min(0.5, Math.max(0, arch.mistakeRate + arch.fatigueRate * ((turn || 1) - 1)));
}

// ---------------------------------------------------------------------------
// Softmax pick — pure, RNG-driven
// ---------------------------------------------------------------------------

export interface ScoredOption<T> {
  readonly item: T;
  readonly score: number;
}

/**
 * Softmax pick: given a list of scored options and a temperature, returns one
 * option using the provided RNG. Mirrors v2 `Decision.setPicker`.
 */
export function softmaxPick<T>(
  options: readonly ScoredOption<T>[],
  temperature: number,
  rng: Rng,
): ScoredOption<T> | null {
  if (options.length === 0) return null;
  const T = Math.max(0.1, temperature);
  const maxScore = Math.max(...options.map((o) => o.score));
  const weights = options.map((o) => Math.exp((o.score - maxScore) / T));
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum === 0 || !Number.isFinite(sum)) {
    const sorted = options.slice().sort((a, b) => b.score - a.score);
    return sorted[0] ?? null;
  }
  const r = (nextInt(rng, 1_000_000) / 1_000_000) * sum;
  let acc = 0;
  for (let i = 0; i < options.length; i++) {
    acc += weights[i] ?? 0;
    if (acc >= r) return options[i] ?? null;
  }
  return options[options.length - 1] ?? null;
}

/**
 * Persona.pick — applies mistake-rate random fallback then softmax.
 * `mistakeRoll` should be a float in [0, 1) drawn from rng before calling.
 */
export function pick<T>(
  options: readonly ScoredOption<T>[],
  ps: PersonaState | null | undefined,
  arch: ArchDef | null | undefined,
  turn: number,
  rng: Rng,
): ScoredOption<T> | null {
  if (options.length === 0) return null;
  if (!ps || !arch) {
    // No personality → argmax
    return options.slice().sort((a, b) => b.score - a.score)[0] ?? null;
  }
  const mr = getMistakeRate(ps, arch, turn);
  const roll = nextInt(rng, 1_000_000) / 1_000_000;
  if (roll < mr) {
    // Random from top-5 (mistake)
    const top5 = options
      .slice()
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    const idx = nextInt(rng, top5.length);
    return top5[idx] ?? null;
  }
  return softmaxPick(options, getTemperature(ps), rng);
}

// ---------------------------------------------------------------------------
// Scoring functions — mirrors v2 scoreReinforceTerritory / scoreAttack / aiFortify
// ---------------------------------------------------------------------------

function continentOwnedBy(state: GameState, continent: string, playerId: PlayerId): boolean {
  const members = CONTINENTS[continent]?.members ?? [];
  return members.every((n) => state.territories[n]?.owner === playerId);
}

export function scoreReinforce(
  state: GameState,
  name: TerritoryName,
  playerId: PlayerId,
  ps: PersonaState | null | undefined,
): number {
  const t = state.territories[name];
  if (!t) return 0;
  const adjEnemies = t.adj.filter((a) => state.territories[a]?.owner !== playerId);
  let score = 0;
  score += 10 * adjEnemies.length * getWeight(ps, 'reinforce', 'adjEnemies');
  const maxEnemyArmies =
    adjEnemies.length > 0
      ? Math.max(...adjEnemies.map((a) => state.territories[a]?.armies ?? 0))
      : 0;
  score += 5 * maxEnemyArmies * getWeight(ps, 'reinforce', 'maxEnemyArmies');
  if (continentOwnedBy(state, t.continent, playerId) && adjEnemies.length > 0) {
    score += 15 * getWeight(ps, 'reinforce', 'continentBorder');
  }
  const contMembers = CONTINENTS[t.continent]?.members ?? [];
  const missing = contMembers.filter((n) => state.territories[n]?.owner !== playerId);
  if (missing.length === 1 && t.adj.includes(missing[0] as TerritoryName)) {
    score += 8 * getWeight(ps, 'reinforce', 'nearContinent');
  }
  const adjFriendly = t.adj.length - adjEnemies.length;
  score -= 5 * adjFriendly * getWeight(ps, 'reinforce', 'adjFriendly');
  return score;
}

export function scoreAttack(
  state: GameState,
  source: TerritoryName,
  target: TerritoryName,
  playerId: PlayerId,
  ps: PersonaState | null | undefined,
): number {
  const src = state.territories[source];
  const tgt = state.territories[target];
  if (!src || !tgt) return -9999;
  let score = 0;
  const tgtCont = tgt.continent;
  const contMembers = CONTINENTS[tgtCont]?.members ?? [];
  const aiOwnsOthers = contMembers
    .filter((n) => n !== target)
    .every((n) => state.territories[n]?.owner === playerId);
  if (aiOwnsOthers) score += 20 * getWeight(ps, 'attack', 'completeContinent');
  const oppId = tgt.owner;
  const oppOwnsContinent = contMembers.every((n) => state.territories[n]?.owner === oppId);
  if (oppOwnsContinent && contMembers.length > 1) {
    score += 15 * getWeight(ps, 'attack', 'breakContinent');
  }
  if (oppId) {
    const oppTerrs = ownedBy(state, oppId);
    // Scale eliminate bonus as the opponent shrinks: a 1-territory enemy is
    // almost always worth killing; the old binary ≤3 cutoff missed the
    // critical "knock them to 1" step.
    if (oppTerrs.length > 0 && oppTerrs.length <= 6) {
      const bonus = (7 - oppTerrs.length) * 4 * getWeight(ps, 'attack', 'eliminate');
      score += bonus;
      // Extra kicker when this very attack *is* the finishing blow.
      if (oppTerrs.length === 1) {
        score += 30 * getWeight(ps, 'attack', 'eliminate');
      }
    }
  }
  score += 5 * (src.armies - tgt.armies) * getWeight(ps, 'attack', 'armyAdvantage');
  // Soften the hopelessness penalty: in classic dice odds, a 3v3 blitz wins
  // about 47%, and 4v3 is a clear favourite. The hard -50 was stopping AIs
  // from closing marginal engagements. Gate it to truly hopeless matchups
  // (we have fewer armies *and* no continent context to defend).
  if (src.armies < tgt.armies && !aiOwnsOthers) {
    score -= 40 * getWeight(ps, 'attack', 'hopelessPenalty');
  } else if (src.armies === tgt.armies && !aiOwnsOthers) {
    score -= 10 * getWeight(ps, 'attack', 'hopelessPenalty');
  }
  return score;
}

export interface FortifyScore {
  readonly from: TerritoryName;
  readonly to: TerritoryName;
  readonly count: number;
  readonly score: number;
}

/**
 * Compute the "enemy pressure" on a territory — the sum of enemy-army counts
 * across all adjacent enemy-owned territories. 0 for pure interiors.
 */
function enemyPressure(state: GameState, name: TerritoryName, playerId: PlayerId): number {
  const t = state.territories[name];
  if (!t) return 0;
  return t.adj.reduce((sum, a) => {
    const n = state.territories[a];
    if (!n || n.owner === playerId) return sum;
    return sum + (n.armies ?? 0);
  }, 0);
}

/**
 * Scores fortify options. Heuristic: maximise pressure-delta — pull armies
 * from low-pressure (interior or quiet) owned territories to high-pressure
 * adjacent owned territories.
 *
 * Original v2 behaviour only considered *pure interior* sources, which meant
 * the AI never re-shuffled between active fronts. That left lopsided stacks
 * on quiet borders while active fronts thinned out, which was a secondary
 * driver of stalemates.
 */
export function scoreFortifyOptions(state: GameState, playerId: PlayerId): FortifyScore[] {
  const owned = ownedBy(state, playerId);
  const sources = owned.filter((n) => (state.territories[n]?.armies ?? 0) >= 2);
  if (sources.length === 0) return [];

  const pressureCache: Record<TerritoryName, number> = {};
  const pressureOf = (n: TerritoryName): number => {
    if (pressureCache[n] === undefined) pressureCache[n] = enemyPressure(state, n, playerId);
    return pressureCache[n];
  };

  const results: FortifyScore[] = [];
  for (const srcName of sources) {
    const srcT = state.territories[srcName];
    if (!srcT) continue;
    const srcPressure = pressureOf(srcName);
    for (const adj of srcT.adj) {
      if (state.territories[adj]?.owner !== playerId) continue;
      const adjName = adj as TerritoryName;
      const adjPressure = pressureOf(adjName);
      // Only fortify in the direction of higher pressure; otherwise we're
      // just shuffling armies sideways. +1 fudge lets the AI move armies
      // off quiet interiors even when destination is also interior but has
      // at least a breath of enemy adjacency.
      if (adjPressure <= srcPressure && !(srcPressure === 0 && adjPressure > 0)) continue;
      const move = srcT.armies - 1;
      const score = adjPressure - srcPressure + (srcPressure === 0 ? 5 : 0);
      results.push({ from: srcName, to: adjName, count: move, score });
    }
  }
  return results;
}

export const Persona = {
  scoreReinforce,
  scoreAttack,
  scoreFortify: scoreFortifyOptions,
  pick,
  softmaxPick,
  getWeight,
  getTemperature,
  getMistakeRate,
  createState: createPersonaState,
};
