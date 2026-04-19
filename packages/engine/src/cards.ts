import type { Rng } from './rng';
import { nextInt } from './rng';
import type { Card, GameState, PlayerState, TerritoryName } from './types';

// ---------------------------------------------------------------------------
// Trade value progression (v2: nextTradeValue)
// ---------------------------------------------------------------------------

const TRADE_TABLE = [4, 6, 8, 10, 12, 15] as const;

export function tradeValue(setsSoFar: number): number {
  if (setsSoFar < TRADE_TABLE.length) return TRADE_TABLE[setsSoFar] as number;
  // After index 5 (value 15): 20, 25, 30 ...
  return 15 + (setsSoFar - 5) * 5;
}

// ---------------------------------------------------------------------------
// Set validity (v2: validSet)
// ---------------------------------------------------------------------------

export function validSet(cards: readonly Card[]): boolean {
  if (cards.length !== 3) return false;
  const wilds = cards.filter((c) => c.type === 'Wild').length;
  const nonWilds = cards.filter((c) => c.type !== 'Wild');
  if (wilds === 0) {
    const types = new Set(nonWilds.map((c) => c.type));
    return types.size === 1 || types.size === 3; // three-of-a-kind or one-of-each
  }
  // With ≥1 wild: any 2 non-wilds (wild substitutes the 3rd type)
  return nonWilds.length + wilds === 3;
}

// ---------------------------------------------------------------------------
// Find best set for AI (v2: findBestAISet)
// ---------------------------------------------------------------------------

/**
 * Returns the indices of the best valid set in `cards`, or null if none exists.
 * "Best" = most owned-territory matches.
 */
export function findBestSet(
  cards: readonly Card[],
  ownedTerritories: ReadonlySet<TerritoryName>,
): [number, number, number] | null {
  let best: [number, number, number] | null = null;
  let bestScore = -1;
  for (let i = 0; i < cards.length; i++) {
    for (let j = i + 1; j < cards.length; j++) {
      for (let k = j + 1; k < cards.length; k++) {
        const trio = [cards[i]!, cards[j]!, cards[k]!] as const;
        if (!validSet(trio as unknown as Card[])) continue;
        const score = trio.filter((c) => c.territory && ownedTerritories.has(c.territory)).length;
        if (score > bestScore) {
          bestScore = score;
          best = [i, j, k];
        }
      }
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Draw a card from deck (shuffling discard if needed)
// ---------------------------------------------------------------------------

export function drawCard(
  state: GameState,
  rng: Rng,
): { card: Card; deck: readonly Card[]; discard: readonly Card[] } {
  let deck = state.deck.slice();
  let discard = state.discard.slice();

  if (deck.length === 0) {
    // Shuffle discard back into deck
    const shuffled = discard.slice();
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = nextInt(rng, i + 1);
      const tmp = shuffled[i]!;
      shuffled[i] = shuffled[j]!;
      shuffled[j] = tmp;
    }
    deck = shuffled;
    discard = [];
  }

  const card = deck[0];
  if (!card) throw new Error('Deck is empty even after reshuffling discard');

  return { card, deck: deck.slice(1), discard };
}

// ---------------------------------------------------------------------------
// Execute a trade (returns updated player and reserves gained + new discard)
// ---------------------------------------------------------------------------

export interface TradeResult {
  readonly player: PlayerState;
  readonly discard: readonly Card[];
  readonly armiesGained: number;
  /** Territory bonus: if any traded card matches an owned territory, +2 armies there */
  readonly territoryBonus: TerritoryName | null;
}

export function tradeCards(
  player: PlayerState,
  indices: readonly [number, number, number],
  state: GameState,
): TradeResult {
  const cards = [player.cards[indices[0]], player.cards[indices[1]], player.cards[indices[2]]];
  if (cards.some((c) => c === undefined)) throw new Error('Invalid card indices');

  const trio = cards as [Card, Card, Card];
  if (!validSet(trio)) throw new Error('Not a valid set');

  const armies = tradeValue(state.tradeCount);

  // Check for territory bonus: +2 if any traded card's territory is owned by player
  let territoryBonus: TerritoryName | null = null;
  for (const card of trio) {
    if (card.territory !== null) {
      const terr = state.territories[card.territory];
      if (terr && terr.owner === player.id) {
        territoryBonus = card.territory;
        break;
      }
    }
  }

  // Remove traded cards from player's hand
  const idxSet = new Set(indices);
  const remainingCards = player.cards.filter((_, i) => !idxSet.has(i));

  const updatedPlayer: PlayerState = {
    ...player,
    cards: remainingCards,
    reserves: player.reserves + armies + (territoryBonus ? 2 : 0),
  };

  const newDiscard = [...state.discard, ...trio];

  return {
    player: updatedPlayer,
    discard: newDiscard,
    armiesGained: armies + (territoryBonus ? 2 : 0),
    territoryBonus,
  };
}
