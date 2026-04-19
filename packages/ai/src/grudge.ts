/**
 * Grudge memory — ported from v2 `const Grudge`.
 * Per-player grudge counters, decaying per turn.
 */

import type { PlayerId } from '@riskrask/engine';

// Constants ported verbatim from v2
const DECAY_PER_TURN = 0.25;
const TERRITORY_LOST = 1.0;
const ARMY_LOST = 0.05;
const MIN_ACTIVE = 0.1;

export interface GrudgeEntry {
  severity: number;
  turn: number;
}

/** GrudgeMap: victim player id → attacker id → entry */
export type GrudgeMap = Record<string, Record<string, GrudgeEntry>>;

/** Record an attack in the grudge map. Returns updated map (pure). */
export function recordGrudge(
  map: GrudgeMap,
  victimId: PlayerId,
  attackerId: PlayerId,
  armyLosses: number,
  territoryLost: boolean,
  turn: number,
): GrudgeMap {
  const next = JSON.parse(JSON.stringify(map)) as GrudgeMap;
  if (!next[victimId]) next[victimId] = {};
  const current = next[victimId]![attackerId] ?? { severity: 0, turn };
  current.severity += armyLosses * ARMY_LOST + (territoryLost ? TERRITORY_LOST : 0);
  current.turn = turn;
  (next[victimId] as Record<string, GrudgeEntry>)[attackerId] = current;
  return next;
}

export function getGrudgeSeverity(
  map: GrudgeMap,
  playerId: PlayerId,
  attackerId: PlayerId,
): number {
  return map[playerId]?.[attackerId]?.severity ?? 0;
}

/** Decay all grudges by DECAY_PER_TURN; remove entries below MIN_ACTIVE. */
export function tickGrudges(map: GrudgeMap): GrudgeMap {
  const next: GrudgeMap = {};
  for (const victimId of Object.keys(map)) {
    next[victimId] = {};
    for (const attackerId of Object.keys(map[victimId] ?? {})) {
      const entry = map[victimId]![attackerId];
      if (!entry) continue;
      const newSeverity = entry.severity * (1 - DECAY_PER_TURN);
      if (newSeverity >= MIN_ACTIVE) {
        (next[victimId] as Record<string, GrudgeEntry>)[attackerId] = {
          severity: newSeverity,
          turn: entry.turn,
        };
      }
    }
  }
  return next;
}

export const Grudge = {
  record: recordGrudge,
  severity: getGrudgeSeverity,
  tick: tickGrudges,
  DECAY_PER_TURN,
  TERRITORY_LOST,
  ARMY_LOST,
  MIN_ACTIVE,
};
