/**
 * Reputation matrix — ported from v2 `const Rep`.
 * Pure functions operating on an external rep matrix (no global state).
 */

import type { GameState, PlayerId } from '@riskrask/engine';
import { TERR_ORDER } from '@riskrask/engine';

// Constants ported verbatim from v2
const DECAY = 0.02;
const ATTACK_COST = 0.25;
const ELIMINATE_BONUS = 1.0;
const PEACE_GROWTH = 0.05;

/** Reputation matrix: outer key = observer, inner key = target. Values in [-1, 1]. */
export type RepMatrix = Record<string, Record<string, number>>;

function clamp(v: number): number {
  return Math.max(-1, Math.min(1, v));
}

function adjacentToAny(
  state: GameState,
  observerId: PlayerId,
  targetId: PlayerId,
): boolean {
  for (const name of TERR_ORDER) {
    const t = state.territories[name];
    if (!t || t.owner !== observerId) continue;
    for (const adj of t.adj) {
      if (state.territories[adj]?.owner === targetId) return true;
    }
  }
  return false;
}

/** Initialise rep matrix from game state (mirrors v2 `Rep.init`). */
export function initRepMatrix(state: GameState): RepMatrix {
  const matrix: RepMatrix = {};
  for (const a of state.players) {
    matrix[a.id] = {};
    for (const b of state.players) {
      if (a.id === b.id) continue;
      // v2: AI-vs-human starts at -0.15
      matrix[a.id]![b.id] = a.isAI && !b.isAI ? -0.15 : 0;
    }
  }
  return matrix;
}

/** Record an attack: attacker's rep toward defender drops; defender's toward attacker drops more. */
export function onAttack(
  matrix: RepMatrix,
  attackerId: PlayerId,
  defenderId: PlayerId,
): RepMatrix {
  const next = JSON.parse(JSON.stringify(matrix)) as RepMatrix;
  const cur = next[attackerId]?.[defenderId] ?? 0;
  if (!next[attackerId]) next[attackerId] = {};
  (next[attackerId] as Record<string, number>)[defenderId] = clamp(cur - ATTACK_COST);
  const cur2 = next[defenderId]?.[attackerId] ?? 0;
  if (!next[defenderId]) next[defenderId] = {};
  (next[defenderId] as Record<string, number>)[attackerId] = clamp(cur2 - ATTACK_COST * 1.2);
  return next;
}

/** Record an elimination event. */
export function onEliminate(
  state: GameState,
  matrix: RepMatrix,
  attackerId: PlayerId,
  defenderId: PlayerId,
): RepMatrix {
  const next = JSON.parse(JSON.stringify(matrix)) as RepMatrix;
  const cur = next[attackerId]?.[defenderId] ?? 0;
  if (!next[attackerId]) next[attackerId] = {};
  (next[attackerId] as Record<string, number>)[defenderId] = clamp(cur - ELIMINATE_BONUS);
  for (const p of state.players) {
    if (p.id === attackerId || p.eliminated) continue;
    if (adjacentToAny(state, p.id as PlayerId, attackerId)) {
      const c = next[p.id]?.[attackerId] ?? 0;
      if (!next[p.id]) next[p.id] = {};
      (next[p.id] as Record<string, number>)[attackerId] = clamp(c - 0.1);
    }
  }
  return next;
}

/** Tick — decay all values toward 0; peace growth for adjacency. */
export function tickRep(state: GameState, matrix: RepMatrix): RepMatrix {
  const next = JSON.parse(JSON.stringify(matrix)) as RepMatrix;
  for (const a of state.players) {
    if (a.eliminated) continue;
    for (const b of state.players) {
      if (a.id === b.id || b.eliminated) continue;
      let r = next[a.id]?.[b.id] ?? 0;
      r = r > 0 ? Math.max(0, r - DECAY) : Math.min(0, r + DECAY);
      if (adjacentToAny(state, a.id as PlayerId, b.id as PlayerId)) r = clamp(r + PEACE_GROWTH);
      if (!next[a.id]) next[a.id] = {};
      (next[a.id] as Record<string, number>)[b.id] = r;
    }
  }
  return next;
}

export function getRep(matrix: RepMatrix, observerId: PlayerId, targetId: PlayerId): number {
  return matrix[observerId]?.[targetId] ?? 0;
}

export function repSymbol(v: number): string {
  if (v > 0.5) return '★';
  if (v > 0.15) return '·';
  if (v > -0.15) return '—';
  if (v > -0.5) return '·';
  return '×';
}

export const Rep = {
  init: initRepMatrix,
  onAttack,
  onEliminate,
  tick: tickRep,
  get: getRep,
  symbol: repSymbol,
  DECAY,
  ATTACK_COST,
  ELIMINATE_BONUS,
  PEACE_GROWTH,
};
