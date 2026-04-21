import {
  NEUTRAL_COLOR,
  NEUTRAL_ID,
  STARTING_ARMIES,
  TERRITORIES,
  TERR_ORDER,
  buildDeck,
} from './board';
import { createRng, nextInt } from './rng';
import type { Card, GameState, PlayerState, TerritoryState } from './types';
import type { PlayerId } from './types';

export interface PlayerConfig {
  /** Caller passes a plain string; engine brands it internally. */
  readonly id: string;
  readonly name: string;
  readonly color: string;
  readonly isAI: boolean;
}

/** Identity helper kept for API stability — PlayerId is a string alias. */
export function playerId(s: string): PlayerId {
  return s;
}

export interface GameConfig {
  readonly seed: string;
  readonly players: readonly PlayerConfig[];
}

/** Fisher-Yates shuffle using the engine RNG (mutates rng cursor) */
function shuffleWith<T>(arr: readonly T[], seed: string): T[] {
  const rng = createRng(seed);
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = nextInt(rng, i + 1);
    const tmp = a[i]!;
    a[i] = a[j]!;
    a[j] = tmp;
  }
  return a;
}

/**
 * Creates a fresh GameState for the setup-claim phase.
 * All 42 territories are unowned (owner: null, armies: 0).
 * RNG is seeded for deck shuffle; rngCursor starts at 0.
 *
 * For `players.length === 2` the engine enables the classic Neutral variant
 * (§3.5): a third `isNeutral: true` seat is synthesised, each seat gets
 * 40 reserves, and the two wild cards are removed from the deck. Neutral
 * takes no turns during play; `advanceTurn` and victory-checks skip it.
 */
export function createInitialState(config: GameConfig): GameState {
  const { seed, players: inputPlayers } = config;
  const humanCount = inputPlayers.length;
  const startingReserves = STARTING_ARMIES[humanCount];
  if (startingReserves === undefined) {
    throw new Error(`Unsupported player count: ${humanCount}. Must be 2-6.`);
  }

  const isTwoPlayer = humanCount === 2;

  // In the 2P Neutral variant we synthesise a third participant — the Neutral.
  // Neutral shares the same lifecycle as the humans during setup so each
  // territory gets claimed and seeded via the existing claim/setup-reinforce
  // flow, but during the main game it is skipped by advanceTurn.
  const players: readonly PlayerConfig[] = isTwoPlayer
    ? [
        ...inputPlayers,
        {
          id: NEUTRAL_ID,
          name: 'Neutral',
          color: NEUTRAL_COLOR,
          isAI: true,
        },
      ]
    : inputPlayers;

  // Build territory map — all unowned
  const territories: Record<string, TerritoryState> = {};
  for (const name of TERR_ORDER) {
    const def = TERRITORIES[name];
    if (!def) continue;
    territories[name] = {
      owner: null,
      armies: 0,
      continent: def.continent,
      x: def.x,
      y: def.y,
      adj: def.adj,
    };
  }

  // Build and shuffle deck using the seed.
  // Two-player variant (§3.5): remove the 2 wild cards so only the 42
  // territory cards are in play.
  const rawDeck = buildDeck();
  const deckSource = isTwoPlayer ? rawDeck.filter((c) => c.type !== 'Wild') : rawDeck;
  const shuffledDeck = shuffleWith(deckSource as Card[], `${seed}:deck`);

  // Build player states (brand id at the boundary)
  const playerStates: PlayerState[] = players.map((p) => ({
    id: playerId(p.id),
    name: p.name,
    color: p.color,
    isAI: p.isAI,
    reserves: startingReserves,
    cards: [],
    eliminated: false,
    ...(p.id === NEUTRAL_ID ? { isNeutral: true } : {}),
  }));

  return {
    schemaVersion: 1,
    seed,
    rngCursor: 0,
    turn: 0,
    currentPlayerIdx: 0,
    phase: 'setup-claim',
    players: playerStates,
    territories,
    deck: shuffledDeck,
    discard: [],
    tradeCount: 0,
    log: [],
    conqueredThisTurn: false,
  };
}
