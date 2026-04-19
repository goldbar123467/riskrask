import { CONTINENTS } from './board';
import type { GameState, PlayerId, TerritoryName } from './types';

/** Returns list of territory names owned by the given player */
export function ownedBy(state: GameState, playerId: PlayerId): TerritoryName[] {
  return Object.keys(state.territories).filter((n) => state.territories[n]?.owner === playerId);
}

/** Returns continent IDs fully controlled by playerId */
export function ownedContinents(state: GameState, playerId: PlayerId): string[] {
  return Object.keys(CONTINENTS).filter((cKey) => {
    const c = CONTINENTS[cKey];
    return c?.members.every((name) => state.territories[name]?.owner === playerId);
  });
}

/**
 * Calculates the number of reinforcement armies for a player.
 * Formula (v2 compatible): max(3, floor(owned / 3)) + continentBonuses
 */
export function calcReinforcements(state: GameState, playerId: PlayerId): number {
  const owned = ownedBy(state, playerId).length;
  const base = Math.max(3, Math.floor(owned / 3));
  const continentBonus = ownedContinents(state, playerId).reduce((sum, cKey) => {
    return sum + (CONTINENTS[cKey]?.bonus ?? 0);
  }, 0);
  return base + continentBonus;
}
