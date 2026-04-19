import { ADJACENCY, CONTINENTS, calcReinforcements } from '@riskrask/engine';
import type { GameState, PlayerState, TerritoryName } from '@riskrask/engine';

export function myPlayer(state: GameState, playerId: string): PlayerState | undefined {
  return state.players.find((p) => p.id === playerId);
}

export function currentPlayer(state: GameState): PlayerState | undefined {
  return state.players[state.currentPlayerIdx];
}

export function myReinforcementsRemaining(state: GameState, playerId: string): number {
  const p = myPlayer(state, playerId);
  return p?.reserves ?? 0;
}

export function continentBonuses(state: GameState, playerId: string): number {
  return calcReinforcements(state, playerId);
}

export function isAdjacent(a: TerritoryName, b: TerritoryName): boolean {
  return ADJACENCY[a]?.includes(b) ?? false;
}

/**
 * Returns true if a territory node should respond to clicks in the current phase.
 * During setup-claim: unowned territories are clickable.
 * During setup-reinforce: owned territories are clickable.
 * During reinforce: owned territories are clickable.
 * During attack: owned territories with 2+ armies (as source) or adjacent enemy (as target).
 * During fortify: owned territories (as source) or connected owned (as target).
 */
export function isClickable(
  state: GameState,
  name: TerritoryName,
  selected: TerritoryName | null,
  playerId: string,
): boolean {
  const terr = state.territories[name];
  if (!terr) return false;

  if (state.phase === 'setup-claim') return terr.owner === null;
  if (state.phase === 'setup-reinforce') return terr.owner === playerId;
  if (state.phase === 'reinforce') return terr.owner === playerId;

  if (state.phase === 'attack') {
    // Source: owned with 2+ armies
    if (terr.owner === playerId && terr.armies >= 2) return true;
    // Target: enemy adjacent to selected
    if (selected && terr.owner !== playerId && terr.owner !== null) {
      return isAdjacent(selected, name);
    }
    return false;
  }

  if (state.phase === 'fortify') {
    if (terr.owner === playerId) return true;
    return false;
  }

  return false;
}

export function canBlitz(state: GameState, src: TerritoryName, tgt: TerritoryName): boolean {
  const srcTerr = state.territories[src];
  const tgtTerr = state.territories[tgt];
  if (!srcTerr || !tgtTerr) return false;
  return srcTerr.armies >= 2 && isAdjacent(src, tgt);
}

export function activePlayers(state: GameState): PlayerState[] {
  return state.players.filter((p) => !p.eliminated);
}

export function ownedCount(state: GameState, playerId: string): number {
  return Object.values(state.territories).filter((t) => t.owner === playerId).length;
}

export function continentBonusForPlayer(state: GameState, playerId: string): number {
  let bonus = 0;
  for (const [key, cont] of Object.entries(CONTINENTS)) {
    void key;
    const owns = cont.members.every((m) => state.territories[m]?.owner === playerId);
    if (owns) bonus += cont.bonus;
  }
  return bonus;
}
