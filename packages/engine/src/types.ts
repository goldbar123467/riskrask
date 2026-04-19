import type { PlayerId, TerritoryName } from '@riskrask/shared';

export type { PlayerId, TerritoryName };

export type Phase = 'setup-claim' | 'setup-reinforce' | 'reinforce' | 'attack' | 'fortify' | 'done';

export type CardType = 'Infantry' | 'Cavalry' | 'Artillery' | 'Wild';

export interface Card {
  readonly territory: TerritoryName | null; // null for wilds
  readonly type: CardType;
}

export interface TerritoryState {
  readonly owner: PlayerId | null;
  readonly armies: number;
  readonly continent: string;
  readonly x: number;
  readonly y: number;
  readonly adj: readonly TerritoryName[];
}

export interface PlayerState {
  readonly id: PlayerId;
  readonly name: string;
  readonly color: string;
  readonly isAI: boolean;
  readonly reserves: number; // armies still to place (setup + main reinforce)
  readonly cards: readonly Card[];
  readonly eliminated: boolean;
}

export interface LogEntry {
  readonly text: string;
  readonly turn: number;
}

export interface PendingMove {
  readonly source: TerritoryName;
  readonly target: TerritoryName;
  readonly min: number;
  readonly max: number;
  readonly atkDiceRolled: number;
}

export interface ForcedTrade {
  readonly playerId: PlayerId;
  readonly reason: 'elimination' | 'five-card-limit';
}

// --- Actions ---

export type Action =
  | { readonly type: 'claim-territory'; readonly territory: TerritoryName }
  | { readonly type: 'setup-reinforce'; readonly territory: TerritoryName }
  | { readonly type: 'reinforce'; readonly territory: TerritoryName; readonly count: number }
  | {
      readonly type: 'trade-cards';
      readonly indices: readonly [number, number, number];
    }
  | { readonly type: 'attack'; readonly from: TerritoryName; readonly to: TerritoryName }
  | { readonly type: 'attack-blitz'; readonly from: TerritoryName; readonly to: TerritoryName }
  | { readonly type: 'move-after-capture'; readonly count: number }
  | { readonly type: 'end-attack-phase' }
  | {
      readonly type: 'fortify';
      readonly from: TerritoryName;
      readonly to: TerritoryName;
      readonly count: number;
    }
  | { readonly type: 'end-turn' }
  | { readonly type: 'concede' };

// --- Effects (UI hints, never mutate state) ---

export type Effect =
  | { readonly kind: 'dice-roll'; readonly atk: readonly number[]; readonly def: readonly number[] }
  | {
      readonly kind: 'territory-captured';
      readonly from: TerritoryName;
      readonly to: TerritoryName;
    }
  | { readonly kind: 'player-eliminated'; readonly playerId: PlayerId }
  | { readonly kind: 'card-drawn'; readonly card: Card }
  | { readonly kind: 'game-over'; readonly winner: PlayerId }
  | { readonly kind: 'log'; readonly text: string };

// --- Game State ---

export interface GameState {
  readonly schemaVersion: 1;
  readonly seed: string;
  readonly rngCursor: number;
  readonly turn: number;
  readonly currentPlayerIdx: number;
  readonly phase: Phase;
  readonly players: readonly PlayerState[];
  readonly territories: Readonly<Record<TerritoryName, TerritoryState>>;
  readonly deck: readonly Card[];
  readonly discard: readonly Card[];
  readonly tradeCount: number; // # of sets traded globally (for progressive values)
  readonly log: readonly LogEntry[];
  readonly conqueredThisTurn: boolean;
  readonly pendingMove?: PendingMove | undefined;
  readonly pendingForcedTrade?: ForcedTrade | undefined;
  readonly winner?: PlayerId | undefined;
}
