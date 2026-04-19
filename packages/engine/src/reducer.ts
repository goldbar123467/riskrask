import { TERR_ORDER } from './board';
import { drawCard, tradeCards, validSet } from './cards';
import { EngineError } from './combat';
import { blitz, rollAttack } from './combat';
import { doFortify } from './fortify';
import { calcReinforcements } from './reinforce';
import { createRng } from './rng';
import type { Action, Effect, GameState, PlayerId } from './types';
import { checkElimination, checkVictory, transferCardsOnElimination } from './victory';

export { EngineError };

export interface ApplyResult {
  readonly next: GameState;
  readonly effects: Effect[];
}

/**
 * Pure reducer: apply an action to a state, returning a new state and side-effect hints.
 * Never mutates the input state.
 */
export function apply(state: GameState, action: Action): ApplyResult {
  // Clone at entry point so all handlers can mutate freely within this call
  const s = structuredClone(state) as GameState;
  return dispatch(s, action);
}

function dispatch(state: GameState, action: Action): ApplyResult {
  switch (action.type) {
    case 'claim-territory':
      return applyClaim(state, action.territory);
    case 'setup-reinforce':
      return applySetupReinforce(state, action.territory);
    case 'reinforce':
      return applyReinforce(state, action.territory, action.count);
    case 'trade-cards':
      return applyTradeCards(state, action.indices);
    case 'attack':
      return applyAttack(state, action.from, action.to, false);
    case 'attack-blitz':
      return applyAttack(state, action.from, action.to, true);
    case 'move-after-capture':
      return applyMoveAfterCapture(state, action.count);
    case 'end-attack-phase':
      return applyEndAttackPhase(state);
    case 'fortify':
      return applyFortify(state, action.from, action.to, action.count);
    case 'end-turn':
      return applyEndTurn(state);
    case 'concede':
      return applyConcede(state);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cp(state: GameState) {
  const p = state.players[state.currentPlayerIdx];
  if (!p) throw new EngineError('NO_CURRENT_PLAYER', 'No current player');
  return p;
}

function makeRng(state: GameState) {
  const rng = createRng(state.seed);
  // Advance to current cursor position
  rng.cursor = state.rngCursor;
  rng.state = advanceState(rng.state, state.rngCursor);
  return rng;
}

/** Advance the PRNG state by n steps without returning values (deterministic replay) */
function advanceState(initialState: number, steps: number): number {
  let s = initialState;
  for (let i = 0; i < steps; i++) {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    void t; // result discarded — we just advance state
  }
  return s;
}

/**
 * Advance to next non-eliminated player and increment turn counter if needed.
 */
function advanceTurn(state: GameState): GameState {
  const n = state.players.length;
  let next = state.currentPlayerIdx;
  for (let step = 1; step <= n; step++) {
    const idx = (state.currentPlayerIdx + step) % n;
    if (!state.players[idx]?.eliminated) {
      next = idx;
      break;
    }
  }
  const turn = next <= state.currentPlayerIdx ? state.turn + 1 : state.turn;
  const nextPlayer = state.players[next]!;
  const reserves = calcReinforcements(state, nextPlayer.id);

  return {
    ...state,
    currentPlayerIdx: next,
    turn,
    phase: 'reinforce',
    conqueredThisTurn: false,
    players: state.players.map((p, i) =>
      i === next ? { ...p, reserves: p.reserves + reserves } : p,
    ),
  };
}

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------

function applyClaim(state: GameState, territory: string): ApplyResult {
  if (state.phase !== 'setup-claim') {
    throw new EngineError('WRONG_PHASE', `Cannot claim in phase: ${state.phase}`);
  }
  const player = cp(state);
  const terr = state.territories[territory];
  if (!terr) throw new EngineError('INVALID_TERRITORY', `Unknown territory: ${territory}`);
  if (terr.owner !== null) {
    throw new EngineError('ALREADY_CLAIMED', `${territory} is already claimed`);
  }

  const newTerritories = {
    ...state.territories,
    [territory]: { ...terr, owner: player.id as PlayerId, armies: 1 },
  };
  const newPlayers = state.players.map((p) =>
    p.id === player.id ? { ...p, reserves: p.reserves - 1 } : p,
  );

  // Advance to next player
  const n = state.players.length;
  const nextIdx = (state.currentPlayerIdx + 1) % n;

  // Check if all 42 territories are now claimed
  const allClaimed = TERR_ORDER.every((name) => {
    const t = name === territory ? { owner: player.id } : state.territories[name];
    return t?.owner !== null;
  });

  let next: GameState = {
    ...state,
    territories: newTerritories,
    players: newPlayers,
    currentPlayerIdx: nextIdx,
  };

  if (allClaimed) {
    next = { ...next, phase: 'setup-reinforce', currentPlayerIdx: 0 };
  }

  const effects: Effect[] = [{ kind: 'log', text: `${player.name} claims ${territory}.` }];

  return { next, effects };
}

function applySetupReinforce(state: GameState, territory: string): ApplyResult {
  if (state.phase !== 'setup-reinforce') {
    throw new EngineError('WRONG_PHASE', `Cannot setup-reinforce in phase: ${state.phase}`);
  }
  const player = cp(state);
  const terr = state.territories[territory];
  if (!terr) throw new EngineError('INVALID_TERRITORY', `Unknown territory: ${territory}`);
  if (terr.owner !== player.id) {
    throw new EngineError('NOT_OWNER', `Player does not own ${territory}`);
  }
  if (player.reserves <= 0) {
    throw new EngineError('NO_RESERVES', 'No reserves left to place');
  }

  const newTerritories = {
    ...state.territories,
    [territory]: { ...terr, armies: terr.armies + 1 },
  };
  const newPlayers = state.players.map((p) =>
    p.id === player.id ? { ...p, reserves: p.reserves - 1 } : p,
  );

  // Advance to next player who still has reserves (or transition to reinforce)
  const n = state.players.length;
  let nextIdx = (state.currentPlayerIdx + 1) % n;

  // Find the next player with reserves > 0
  let found = false;
  for (let step = 0; step < n; step++) {
    const idx = (state.currentPlayerIdx + 1 + step) % n;
    const p = newPlayers[idx];
    if (p && !p.eliminated && p.reserves > 0) {
      nextIdx = idx;
      found = true;
      break;
    }
  }

  const allPlaced = !found && newPlayers.every((p) => p.eliminated || p.reserves <= 0);

  let next: GameState = {
    ...state,
    territories: newTerritories,
    players: newPlayers,
    currentPlayerIdx: nextIdx,
  };

  if (allPlaced) {
    // Transition to main game: give player 0 their first reinforcement
    const firstPlayer = newPlayers[0]!;
    const reserves = calcReinforcements({ ...next }, firstPlayer.id);
    next = {
      ...next,
      phase: 'reinforce',
      currentPlayerIdx: 0,
      turn: 0,
      players: newPlayers.map((p, i) => (i === 0 ? { ...p, reserves } : p)),
    };
  }

  const effects: Effect[] = [{ kind: 'log', text: `${player.name} reinforces ${territory}.` }];

  return { next, effects };
}

function applyReinforce(state: GameState, territory: string, count: number): ApplyResult {
  if (state.phase !== 'reinforce') {
    throw new EngineError('WRONG_PHASE', `Cannot reinforce in phase: ${state.phase}`);
  }
  const player = cp(state);
  const terr = state.territories[territory];
  if (!terr) throw new EngineError('INVALID_TERRITORY', `Unknown territory: ${territory}`);
  if (terr.owner !== player.id) {
    throw new EngineError('NOT_OWNER', `Player does not own ${territory}`);
  }
  if (count < 1) throw new EngineError('INVALID_COUNT', 'Count must be >= 1');
  if (count > player.reserves) {
    throw new EngineError('INSUFFICIENT_RESERVES', `Only ${player.reserves} reserves left`);
  }

  const newTerritories = {
    ...state.territories,
    [territory]: { ...terr, armies: terr.armies + count },
  };
  const newPlayers = state.players.map((p) =>
    p.id === player.id ? { ...p, reserves: p.reserves - count } : p,
  );

  // If all reserves placed, advance to attack phase
  const updatedPlayer = newPlayers[state.currentPlayerIdx]!;
  const phase = updatedPlayer.reserves <= 0 ? 'attack' : 'reinforce';

  const effects: Effect[] = [
    { kind: 'log', text: `${player.name} reinforces ${territory} with ${count} armies.` },
  ];

  return {
    next: { ...state, territories: newTerritories, players: newPlayers, phase },
    effects,
  };
}

function applyTradeCards(
  state: GameState,
  indices: readonly [number, number, number],
): ApplyResult {
  if (state.phase !== 'reinforce' && state.phase !== 'attack') {
    throw new EngineError('WRONG_PHASE', `Cannot trade cards in phase: ${state.phase}`);
  }
  const player = cp(state);

  const cards = [player.cards[indices[0]], player.cards[indices[1]], player.cards[indices[2]]];
  if (cards.some((c) => c === undefined)) {
    throw new EngineError('INVALID_INDEX', 'Card index out of bounds');
  }

  if (!validSet(cards as NonNullable<(typeof cards)[0]>[])) {
    throw new EngineError('INVALID_SET', 'Cards do not form a valid set');
  }

  const result = tradeCards(player, indices, state);
  const newPlayers = state.players.map((p) => (p.id === player.id ? result.player : p));

  const effects: Effect[] = [
    {
      kind: 'log',
      text: `${player.name} trades cards for ${result.armiesGained} armies.`,
    },
  ];

  return {
    next: {
      ...state,
      players: newPlayers,
      discard: result.discard,
      tradeCount: state.tradeCount + 1,
    },
    effects,
  };
}

function applyAttack(state: GameState, from: string, to: string, isBlitz: boolean): ApplyResult {
  if (state.phase !== 'attack') {
    throw new EngineError('WRONG_PHASE', `Cannot attack in phase: ${state.phase}`);
  }
  if (state.pendingMove) {
    throw new EngineError('PENDING_MOVE', 'Must resolve move-after-capture before attacking again');
  }

  const rng = makeRng(state);

  if (isBlitz) {
    const result = blitz(state, from, to, rng);
    return { next: result.next, effects: result.effects };
  }
  const result = rollAttack(state, from, to, rng);
  return { next: result.next, effects: result.effects };
}

function applyMoveAfterCapture(state: GameState, count: number): ApplyResult {
  if (!state.pendingMove) {
    throw new EngineError('NO_PENDING_MOVE', 'No pending move to resolve');
  }

  const { source, target, min, max } = state.pendingMove;
  if (count < min || count > max) {
    throw new EngineError(
      'INVALID_COUNT',
      `Move count must be between ${min} and ${max}, got ${count}`,
    );
  }

  const srcTerr = state.territories[source];
  const tgtTerr = state.territories[target];
  if (!srcTerr || !tgtTerr) {
    throw new EngineError('INVALID_TERRITORY', 'Invalid pending move territories');
  }

  const newTerritories = {
    ...state.territories,
    [source]: { ...srcTerr, armies: srcTerr.armies - count },
    [target]: { ...tgtTerr, armies: tgtTerr.armies + count },
  };

  // Remove pendingMove; check elimination + victory
  const player = cp(state);
  const defenderId = state.pendingMove.target; // tgt was just captured
  // Defender is whoever owned the territory before (already changed to player.id)
  // We need to check if any player was eliminated via their last territory being captured
  let next: GameState = {
    ...state,
    territories: newTerritories,
    pendingMove: undefined,
  };

  // Check all players for elimination (look at who lost their last territory)
  for (const p of next.players) {
    if (p.eliminated) continue;
    if (p.id === player.id) continue;
    if (checkElimination(next, p.id)) {
      next = {
        ...transferCardsOnElimination(next, player.id, p.id),
        players: next.players.map((pl) => (pl.id === p.id ? { ...pl, eliminated: true } : pl)),
      };
      const effects2: Effect[] = [{ kind: 'player-eliminated', playerId: p.id }];
      void effects2; // merged below
    }
  }

  const winner = checkVictory(next);
  if (winner) {
    next = { ...next, phase: 'done', winner };
    return {
      next,
      effects: [
        { kind: 'log', text: `${player.name} moves ${count} armies into ${target}.` },
        { kind: 'game-over', winner },
      ],
    };
  }

  const effects: Effect[] = [
    { kind: 'log', text: `${player.name} moves ${count} armies into ${target}.` },
  ];
  // Also add elimination effects
  for (const p of state.players) {
    if (!p.eliminated && p.id !== player.id && checkElimination(next, p.id)) {
      effects.push({ kind: 'player-eliminated', playerId: p.id });
    }
  }

  return { next, effects };
}

function applyEndAttackPhase(state: GameState): ApplyResult {
  if (state.phase !== 'attack') {
    throw new EngineError('WRONG_PHASE', `Not in attack phase: ${state.phase}`);
  }

  const player = cp(state);
  const effects: Effect[] = [];
  let next: GameState = { ...state, phase: 'fortify' };

  // Award card if player conquered a territory this turn
  if (state.conqueredThisTurn) {
    const rng = makeRng(state);
    const drawResult = drawCard(state, rng);
    effects.push({ kind: 'card-drawn', card: drawResult.card });
    effects.push({
      kind: 'log',
      text: `${player.name} earns a territory card (${drawResult.card.type}).`,
    });
    const newPlayers = state.players.map((p) =>
      p.id === player.id ? { ...p, cards: [...p.cards, drawResult.card] } : p,
    );
    next = {
      ...next,
      players: newPlayers,
      deck: drawResult.deck,
      discard: drawResult.discard,
      conqueredThisTurn: false,
    };
  }

  return { next, effects };
}

function applyFortify(state: GameState, from: string, to: string, count: number): ApplyResult {
  if (state.phase !== 'fortify') {
    throw new EngineError('WRONG_PHASE', `Cannot fortify in phase: ${state.phase}`);
  }

  const fortifyResult = doFortify(state, from, to, count);

  // Fortify ends the turn
  const endResult = advanceTurn(fortifyResult.next);

  return {
    next: endResult,
    effects: fortifyResult.effects,
  };
}

function applyEndTurn(state: GameState): ApplyResult {
  if (state.phase !== 'fortify' && state.phase !== 'attack') {
    throw new EngineError('WRONG_PHASE', `Cannot end turn in phase: ${state.phase}`);
  }

  return { next: advanceTurn(state), effects: [] };
}

function applyConcede(state: GameState): ApplyResult {
  const player = cp(state);
  const newPlayers = state.players.map((p) =>
    p.id === player.id ? { ...p, eliminated: true } : p,
  );

  let next: GameState = { ...state, players: newPlayers };

  const winner = checkVictory(next);
  if (winner) {
    next = { ...next, phase: 'done', winner };
    return {
      next,
      effects: [
        { kind: 'log', text: `${player.name} concedes.` },
        { kind: 'game-over', winner },
      ],
    };
  }

  // Advance to next player
  const advanced = advanceTurn(next);
  return {
    next: advanced,
    effects: [{ kind: 'log', text: `${player.name} concedes.` }],
  };
}
