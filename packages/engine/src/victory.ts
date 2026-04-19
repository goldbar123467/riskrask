import { TERR_ORDER } from './board';
import type { Effect, GameState, PlayerId } from './types';

/**
 * Returns true if the player owns no territories.
 */
export function checkElimination(state: GameState, playerId: PlayerId): boolean {
  return !TERR_ORDER.some((name) => state.territories[name]?.owner === playerId);
}

/**
 * Returns the winner's PlayerId if only one non-eliminated player remains,
 * or if one player owns all 42 territories. Otherwise returns null.
 */
export function checkVictory(state: GameState): PlayerId | null {
  const active = state.players.filter((p) => !p.eliminated);
  if (active.length === 1) {
    return active[0]!.id;
  }

  // Check if any player owns all territories
  const allOwned = TERR_ORDER.every((name) => state.territories[name]?.owner !== null);
  if (allOwned) {
    const firstOwner = state.territories[TERR_ORDER[0]!]?.owner;
    if (firstOwner && TERR_ORDER.every((name) => state.territories[name]?.owner === firstOwner)) {
      return firstOwner;
    }
  }

  return null;
}

export interface EliminationResult {
  readonly next: GameState;
  readonly effects: Effect[];
}

/**
 * Transfer cards from an eliminated player to their attacker.
 * Sets pendingForcedTrade if attacker reaches >= 5 cards.
 */
export function transferCardsOnElimination(
  state: GameState,
  attackerId: PlayerId,
  defenderId: PlayerId,
): GameState {
  const defender = state.players.find((p) => p.id === defenderId);
  const attacker = state.players.find((p) => p.id === attackerId);
  if (!defender || !attacker) return state;

  const transferredCards = defender.cards.slice();
  const newAttackerCards = [...attacker.cards, ...transferredCards];

  const newPlayers = state.players.map((p) => {
    if (p.id === attackerId) return { ...p, cards: newAttackerCards };
    if (p.id === defenderId) return { ...p, cards: [] };
    return p;
  });

  // If attacker now holds >= 5 cards, set forced trade
  const forcedTrade =
    newAttackerCards.length >= 5
      ? { playerId: attackerId, reason: 'elimination' as const }
      : undefined;

  return {
    ...state,
    players: newPlayers,
    ...(forcedTrade ? { pendingForcedTrade: forcedTrade } : {}),
  };
}
