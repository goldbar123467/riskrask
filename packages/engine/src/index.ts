// Kept for backward compatibility with pre-engine-port sentinel test
export const ENGINE_SENTINEL = 'riskrask-engine' as const;

// Core reducer
export { apply, EngineError } from './reducer';
export type { ApplyResult } from './reducer';

// Initial state factory
export { createInitialState, playerId } from './setup';
export type { GameConfig, PlayerConfig } from './setup';

// RNG
export { createRng, rollDie, nextInt } from './rng';
export type { Rng } from './rng';

// State hash
export { hashState } from './hash';

// Board constants
export {
  CONTINENTS,
  TERRITORIES,
  TERR_ORDER,
  ADJ_PAIRS,
  ADJACENCY,
  EDGE_EXIT_PAIRS,
  STARTING_ARMIES,
  CARD_TYPES,
  PALETTE,
  BOARD_TERRITORY_COUNT,
  NEUTRAL_ID,
  NEUTRAL_COLOR,
  buildDeck,
} from './board';
export type { ContinentDef, TerritoryDef, CardTemplate, BaseCardType } from './board';

// Cards
export { validSet, tradeValue, findBestSet, drawCard, tradeCards } from './cards';
export type { TradeResult } from './cards';

// Combat
export { rollAttack, blitz } from './combat';
export type { RollResult, BlitzResult } from './combat';

// Fortify
export { canFortify, doFortify, connectedThroughOwned } from './fortify';
export type { FortifyResult } from './fortify';

// Reinforce
export { calcReinforcements, ownedBy, ownedContinents } from './reinforce';

// Victory
export { checkElimination, checkVictory, transferCardsOnElimination } from './victory';

// All types
export type {
  Phase,
  CardType,
  Card,
  TerritoryState,
  PlayerState,
  LogEntry,
  PendingMove,
  ForcedTrade,
  Action,
  Effect,
  GameState,
  PlayerId,
  TerritoryName,
} from './types';
