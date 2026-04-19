import { ADJACENCY } from './board';
import type { Rng } from './rng';
import { rollDie } from './rng';
import type { Effect, GameState, PendingMove, TerritoryName } from './types';

export class EngineError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'EngineError';
  }
}

export interface RollResult {
  readonly atkDice: readonly number[];
  readonly defDice: readonly number[];
  readonly atkLost: number;
  readonly defLost: number;
  readonly captured: boolean;
  readonly next: GameState;
  readonly effects: Effect[];
}

/**
 * Execute a single combat roll.
 * Attacker: min(3, src.armies - 1) dice
 * Defender: min(2, tgt.armies) dice
 * Pairs sorted descending, ties go to defender.
 */
export function rollAttack(
  state: GameState,
  srcName: TerritoryName,
  tgtName: TerritoryName,
  rng: Rng,
): RollResult {
  const cp = state.players[state.currentPlayerIdx];
  if (!cp) throw new EngineError('NO_CURRENT_PLAYER', 'No current player');

  const src = state.territories[srcName];
  const tgt = state.territories[tgtName];

  if (!src) throw new EngineError('INVALID_TERRITORY', `Unknown territory: ${srcName}`);
  if (!tgt) throw new EngineError('INVALID_TERRITORY', `Unknown territory: ${tgtName}`);
  if (src.owner !== cp.id) throw new EngineError('NOT_OWNER', `Player does not own ${srcName}`);
  if (src.armies < 2)
    throw new EngineError('INSUFFICIENT_ARMIES', 'Source needs at least 2 armies to attack');

  const adj = ADJACENCY[srcName] ?? [];
  if (!adj.includes(tgtName)) {
    throw new EngineError('NOT_ADJACENT', `${srcName} is not adjacent to ${tgtName}`);
  }
  if (tgt.owner === cp.id) {
    throw new EngineError('SAME_OWNER', 'Cannot attack your own territory');
  }

  const atkCount = Math.min(3, src.armies - 1);
  const defCount = Math.min(2, tgt.armies);

  // Roll dice
  const atkDice = Array.from({ length: atkCount }, () => rollDie(rng)).sort((a, b) => b - a);
  const defDice = Array.from({ length: defCount }, () => rollDie(rng)).sort((a, b) => b - a);

  // Resolve pairs
  let atkLost = 0;
  let defLost = 0;
  const comparisons = Math.min(atkDice.length, defDice.length);
  for (let i = 0; i < comparisons; i++) {
    if ((atkDice[i] ?? 0) > (defDice[i] ?? 0)) {
      defLost++;
    } else {
      atkLost++; // ties go to defender
    }
  }

  const newSrcArmies = src.armies - atkLost;
  const newTgtArmies = tgt.armies - defLost;
  const captured = newTgtArmies <= 0;

  // Build new territories
  const newTerritories = { ...state.territories };
  newTerritories[srcName] = { ...src, armies: newSrcArmies };

  const effects: Effect[] = [{ kind: 'dice-roll', atk: atkDice, def: defDice }];

  let pendingMove: PendingMove | undefined;

  if (captured) {
    // Transfer ownership; armies moved later via move-after-capture action
    newTerritories[tgtName] = { ...tgt, armies: 0, owner: cp.id };
    effects.push({ kind: 'territory-captured', from: srcName, to: tgtName });

    const min = Math.max(1, atkCount);
    const max = newSrcArmies - 1;
    pendingMove = {
      source: srcName,
      target: tgtName,
      min: Math.min(min, max), // guard against edge case
      max,
      atkDiceRolled: atkCount,
    };
  } else {
    newTerritories[tgtName] = { ...tgt, armies: newTgtArmies };
  }

  const next: GameState = {
    ...state,
    rngCursor: state.rngCursor + atkCount + defCount,
    territories: newTerritories,
    conqueredThisTurn: state.conqueredThisTurn || captured,
    ...(pendingMove ? { pendingMove } : {}),
  };

  return { atkDice, defDice, atkLost, defLost, captured, next, effects };
}

export interface BlitzResult {
  readonly next: GameState;
  readonly effects: Effect[];
  readonly rolls: number;
}

/**
 * Repeat single-roll attacks until the territory is captured or the attacker has 1 army.
 */
export function blitz(
  state: GameState,
  srcName: TerritoryName,
  tgtName: TerritoryName,
  rng: Rng,
): BlitzResult {
  let current = state;
  const effects: Effect[] = [];
  let rolls = 0;
  const cp = state.players[state.currentPlayerIdx];
  if (!cp) throw new EngineError('NO_CURRENT_PLAYER', 'No current player');

  while (true) {
    const src = current.territories[srcName];
    const tgt = current.territories[tgtName];
    if (!src || !tgt) break;
    if (src.armies < 2) break;
    if (tgt.owner === cp.id) break; // already captured
    if (tgt.armies <= 0) break;

    const result = rollAttack(current, srcName, tgtName, rng);
    effects.push(...result.effects);
    rolls++;
    current = result.next;

    if (result.captured) break;
  }

  return { next: current, effects, rolls };
}
