/**
 * Orchestrator — plays a full AI turn.
 * takeTurn(state, playerId, rng) → Action[]
 *
 * Engine phase transitions:
 *   reinforce (reserves>0) → attack (when reserves reach 0 via final reinforce action)
 *   attack    → fortify (via end-attack-phase)
 *   fortify   → reinforce for next player (via fortify action or end-turn)
 *
 * end-turn is valid in attack or fortify phase only.
 * fortify action auto-advances turn.
 *
 * No globals, no I/O. Deterministic given same state + rng.
 */

import type { Action, GameState, PlayerId, TerritoryName } from '@riskrask/engine';
import { apply, calcReinforcements, canFortify, findBestSet, ownedBy } from '@riskrask/engine';
import type { Rng } from '@riskrask/engine';
import { Arch } from './arch.js';
import { Band } from './band.js';
import { Book } from './book.js';
import { Persona, createPersonaState } from './persona.js';
import type { PersonaState } from './persona.js';
import { Rule } from './rule.js';
import type { ScoredOption } from './persona.js';

const MAX_ATTACKS_PER_TURN = 8;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function ownedSet(state: GameState, playerId: PlayerId): ReadonlySet<TerritoryName> {
  return new Set(ownedBy(state, playerId));
}

/** Trade all eligible card sets before reinforcing. Returns [actions, nextState]. */
function doTrades(
  state: GameState,
  playerId: PlayerId,
): [Action[], GameState] {
  const actions: Action[] = [];
  let s = state;
  for (;;) {
    const cp = s.players[s.currentPlayerIdx];
    if (!cp || cp.id !== playerId) break;
    if (cp.cards.length < 3) break;
    const best = findBestSet(cp.cards, ownedSet(s, playerId));
    if (!best) break;
    const action: Action = { type: 'trade-cards', indices: best };
    const result = apply(s, action);
    actions.push(action);
    s = result.next;
  }
  return [actions, s];
}

/** Place all pending reinforcements using persona scoring. Returns [actions, nextState].
 *  Stops as soon as phase transitions away from 'reinforce' (engine auto-advances on last placement).
 */
function doReinforce(
  state: GameState,
  playerId: PlayerId,
  ps: PersonaState | null | undefined,
  arch: ReturnType<typeof Arch.get>,
  rng: Rng,
): [Action[], GameState] {
  const actions: Action[] = [];
  let s = state;

  while (s.phase === 'reinforce') {
    const cp = s.players[s.currentPlayerIdx];
    if (!cp || cp.id !== playerId || cp.reserves <= 0) break;

    const owned = ownedBy(s, playerId);
    if (owned.length === 0) break;

    const scored: ScoredOption<TerritoryName>[] = owned.map((n) => {
      let score = Persona.scoreReinforce(s, n, playerId, ps);
      if (arch) score += Book.reinforceBonus(arch.openingBook, n, s.turn);
      return { item: n, score };
    });

    const chosen = Persona.pick(scored, ps, arch, s.turn, rng);
    const target = chosen?.item ?? owned[0];
    if (!target) break;

    const action: Action = { type: 'reinforce', territory: target, count: 1 };
    const result = apply(s, action);
    actions.push(action);
    s = result.next;
    // Engine transitions to 'attack' when reserves hit 0
  }
  return [actions, s];
}

/** Attack phase — blitz-style, up to MAX_ATTACKS_PER_TURN. Returns [actions, nextState]. */
function doAttack(
  state: GameState,
  playerId: PlayerId,
  ps: PersonaState | null | undefined,
  arch: ReturnType<typeof Arch.get>,
  rng: Rng,
): [Action[], GameState] {
  const actions: Action[] = [];
  let s = state;
  let attacksMade = 0;

  for (;;) {
    if (s.phase !== 'attack') break;
    if (s.winner) break;

    // Resolve any pending move-after-capture first
    if (s.pendingMove) {
      const { max } = s.pendingMove;
      const action: Action = { type: 'move-after-capture', count: max };
      const result = apply(s, action);
      actions.push(action);
      s = result.next;
      continue;
    }

    if (attacksMade >= MAX_ATTACKS_PER_TURN) break;

    const owned = ownedBy(s, playerId);
    const options: ScoredOption<{ from: TerritoryName; to: TerritoryName }>[] = [];

    for (const src of owned) {
      const sT = s.territories[src];
      if (!sT || sT.armies < 2) continue;
      if (arch && !Rule.canAttack(s, arch, src)) continue;

      for (const adj of sT.adj) {
        if (s.territories[adj]?.owner === playerId) continue;
        let score = Persona.scoreAttack(s, src, adj as TerritoryName, playerId, ps);
        if (arch) score += Book.attackBonus(arch.openingBook, adj as TerritoryName, s.turn);
        options.push({ item: { from: src, to: adj as TerritoryName }, score });
      }
    }

    if (options.length === 0) break;

    const chosen = Persona.pick(options, ps, arch, s.turn, rng);
    if (!chosen || chosen.score <= 0) break;

    // v2: stop if AI holds ≥1 conquest and max source stack ≤3
    if (attacksMade >= 1) {
      const maxSrc = Math.max(...owned.map((n) => s.territories[n]?.armies ?? 0));
      if (maxSrc <= 3) break;
    }

    const action: Action = {
      type: 'attack-blitz',
      from: chosen.item.from,
      to: chosen.item.to,
    };
    const result = apply(s, action);
    actions.push(action);
    s = result.next;
    attacksMade++;

    // Resolve pending move immediately
    if (s.pendingMove && !s.winner) {
      const { max } = s.pendingMove;
      const moveAction: Action = { type: 'move-after-capture', count: max };
      const moveResult = apply(s, moveAction);
      actions.push(moveAction);
      s = moveResult.next;
    }

    if (s.winner) break;
  }

  // Drain any remaining pending moves
  while (s.phase === 'attack' && s.pendingMove && !s.winner) {
    const { max } = s.pendingMove;
    const action: Action = { type: 'move-after-capture', count: max };
    const result = apply(s, action);
    actions.push(action);
    s = result.next;
  }

  return [actions, s];
}

/** Fortify phase. Note: the engine auto-advances turn on fortify — so we DON'T append end-turn after. */
function doFortify(
  state: GameState,
  playerId: PlayerId,
  ps: PersonaState | null | undefined,
  arch: ReturnType<typeof Arch.get>,
  rng: Rng,
): [Action[], GameState] {
  const actions: Action[] = [];
  let s = state;
  if (s.phase !== 'fortify') return [actions, s];

  const scores = Persona.scoreFortify(s, playerId);
  if (scores.length === 0) return [actions, s];

  const options: ScoredOption<{ from: TerritoryName; to: TerritoryName; count: number }>[] =
    scores
      .filter((fc) => canFortify(s, fc.from, fc.to, playerId))
      .map((fc) => ({
        item: { from: fc.from, to: fc.to, count: fc.count },
        score: fc.score,
      }));

  if (options.length === 0) return [actions, s];

  const chosen = Persona.pick(options, ps, arch, s.turn, rng);
  if (!chosen) return [actions, s];

  const action: Action = {
    type: 'fortify',
    from: chosen.item.from,
    to: chosen.item.to,
    count: chosen.item.count,
  };
  try {
    const result = apply(s, action);
    actions.push(action);
    s = result.next;
    // Engine has auto-advanced turn; no end-turn needed after fortify
  } catch {
    // Fortify failed — skip
  }

  return [actions, s];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Play a full AI turn for `playerId`.
 *
 * `archId` — the archetype for this player. Defaults to 'dilettante'.
 * `ps`     — optional pre-existing PersonaState (for Regret/Band continuity).
 *
 * Returns the sequence of Actions the engine reducer will accept.
 * Caller should apply them via `apply()`.
 */
export function takeTurn(
  state: GameState,
  playerId: PlayerId,
  rng: Rng,
  archId = 'dilettante',
  psIn?: PersonaState,
): Action[] {
  const arch = Arch.get(archId) ?? Arch.get('dilettante')!;

  let ps: PersonaState = psIn ?? createPersonaState(arch);
  ps = Band.recalibrate(state, ps, arch, playerId);

  const actions: Action[] = [];
  let s = state;

  // 1. Trade cards (valid in reinforce or attack phase)
  if (s.phase === 'reinforce' || s.phase === 'attack') {
    const [tradeActions, afterTrade] = doTrades(s, playerId);
    actions.push(...tradeActions);
    s = afterTrade;
  }

  if (s.winner) return actions;

  // 2. Reinforce
  if (s.phase === 'reinforce') {
    const [reinActions, afterReinforce] = doReinforce(s, playerId, ps, arch, rng);
    actions.push(...reinActions);
    s = afterReinforce;
  }

  if (s.winner) return actions;

  // After reinforce, engine should be in 'attack' phase
  // If somehow still in 'reinforce' (e.g. reserves were already 0), we can't attack
  if (s.phase !== 'attack') return actions;

  // 3. Attack
  const [atkActions, afterAttack] = doAttack(s, playerId, ps, arch, rng);
  actions.push(...atkActions);
  s = afterAttack;

  if (s.winner) return actions;

  // End attack phase
  if (s.phase === 'attack') {
    const endAtk: Action = { type: 'end-attack-phase' };
    const result = apply(s, endAtk);
    actions.push(endAtk);
    s = result.next;
  }

  if (s.winner) return actions;

  // 4. Fortify (engine auto-advances turn on successful fortify)
  if (s.phase === 'fortify') {
    const [fortActions, afterFortify] = doFortify(s, playerId, ps, arch, rng);
    actions.push(...fortActions);
    s = afterFortify;
    // If fortify succeeded, engine already advanced the turn — no end-turn needed
    // If fortify was skipped (no candidates), we need end-turn
    if (!s.winner && s.phase === 'fortify') {
      actions.push({ type: 'end-turn' });
    }
  }

  return actions;
}
