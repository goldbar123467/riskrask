import { TERRITORIES, TERR_ORDER, STARTING_ARMIES, buildDeck } from './board';
import type { GameState, PlayerState, TerritoryState, Card } from './types';
import type { PlayerId } from './types';
import { createRng, nextInt } from './rng';

export interface PlayerConfig {
  readonly id: PlayerId;
  readonly name: string;
  readonly color: string;
  readonly isAI: boolean;
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
 */
export function createInitialState(config: GameConfig): GameState {
  const { seed, players } = config;
  const numPlayers = players.length;
  const startingReserves = STARTING_ARMIES[numPlayers];
  if (startingReserves === undefined) {
    throw new Error(`Unsupported player count: ${numPlayers}. Must be 3-6.`);
  }

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

  // Build and shuffle deck using the seed
  const rawDeck = buildDeck();
  const shuffledDeck = shuffleWith(rawDeck as Card[], seed + ':deck');

  // Build player states
  const playerStates: PlayerState[] = players.map((p) => ({
    id: p.id,
    name: p.name,
    color: p.color,
    isAI: p.isAI,
    reserves: startingReserves,
    cards: [],
    eliminated: false,
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
