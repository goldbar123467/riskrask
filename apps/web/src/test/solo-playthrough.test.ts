/**
 * Integration test for the web-app's solo game loop.
 *
 * Reproduces the user complaint: "the game is not playable, AI does not work,
 * game loop is broken." The engine+AI pass at the pure-library level (see
 * scripts/smoke.ts — 0 engine errors across a 4-AI playthrough), so this test
 * exercises the *web-app glue*: the zustand `useGame` store + the same
 * `dilettanteTurn` wrapper `useSoloDispatcher` uses + the same minimal-legal
 * actions `Play.tsx`'s human-turn click handlers would dispatch.
 *
 * We do NOT render React — instead we call `useGame.getState().dispatch(...)`
 * directly, which is exactly what `useSoloDispatcher.runAiStep` does under the
 * hood. That keeps this test fast and isolates the failure to the store/glue
 * layer rather than any DOM rendering concern.
 */

import {
  ADJACENCY,
  type Action,
  type GameState,
  type PlayerId,
  TERR_ORDER,
  type TerritoryName,
  createInitialState,
  findBestSet,
  ownedBy,
  playerId,
} from '@riskrask/engine';
import { describe, expect, it } from 'vitest';
import { dilettanteTurn } from '../game/aiRunner';
import { useGame } from '../game/useGame';

const SEED = 'test-playthrough-1';
const MAX_ACTIONS = 20000;
const MAX_TURNS = 500;

function stateFingerprint(s: GameState): string {
  const ownedCounts = s.players
    .map((p) => `${p.name}${p.isAI ? '(ai)' : '(hu)'}=${ownedBy(s, p.id).length}a${p.reserves}r`)
    .join(' ');
  const cp = s.players[s.currentPlayerIdx];
  return [
    `seed=${s.seed}`,
    `turn=${s.turn}`,
    `phase=${s.phase}`,
    `currentPlayer=${cp?.name ?? '?'}(${s.currentPlayerIdx})`,
    `pendingMove=${s.pendingMove ? `${s.pendingMove.source}->${s.pendingMove.target}(${s.pendingMove.min}-${s.pendingMove.max})` : 'none'}`,
    `pendingForcedTrade=${s.pendingForcedTrade ? `${s.pendingForcedTrade.playerId}:${s.pendingForcedTrade.reason}` : 'none'}`,
    `rngCursor=${s.rngCursor}`,
    `winner=${s.winner ?? 'none'}`,
    `ownership=[${ownedCounts}]`,
  ].join(' | ');
}

/** Dispatch via the real store, wrapping errors with a readable fingerprint. */
function dispatchOrFail(action: Action, tag: string): void {
  const before = useGame.getState().state;
  if (!before) throw new Error(`[${tag}] store has no state before dispatch`);
  try {
    useGame.getState().dispatch(action);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `[${tag}] dispatch threw on ${JSON.stringify(action)}: ${msg}\n  state: ${stateFingerprint(before)}`,
    );
  }
}

/**
 * Plan a minimal-but-legal action for the human seat at index 0 — mirrors the
 * `handleDeployConfirm` / `handleAttackBlitz` / `handleFortifySkip` button
 * handlers in `Play.tsx` but without any UI selection state.
 */
function humanAction(state: GameState, humanId: PlayerId): Action | null {
  if (state.pendingForcedTrade && state.pendingForcedTrade.playerId === humanId) {
    const me = state.players.find((p) => p.id === humanId);
    if (!me) return null;
    const best = findBestSet(me.cards, new Set(ownedBy(state, humanId)));
    if (best) return { type: 'trade-cards', indices: best };
    return null;
  }
  if (state.pendingMove) {
    return { type: 'move-after-capture', count: state.pendingMove.min };
  }

  if (state.phase === 'setup-claim') {
    const unclaimed = TERR_ORDER.find((n) => state.territories[n]?.owner === null);
    return unclaimed ? { type: 'claim-territory', territory: unclaimed } : null;
  }

  if (state.phase === 'setup-reinforce') {
    // Place on first owned territory (matches Play.tsx click handler).
    const owned = TERR_ORDER.find((n) => state.territories[n]?.owner === humanId);
    return owned ? { type: 'setup-reinforce', territory: owned } : null;
  }

  if (state.phase === 'reinforce') {
    const me = state.players.find((p) => p.id === humanId);
    if (!me) return null;
    if (me.reserves <= 0) {
      // Engine will auto-advance to attack when we try to end reinforce; but
      // there is no explicit action for that — just do nothing here, the
      // engine should not keep us in reinforce with 0 reserves.
      // If we are stuck, fall through and let the caller detect stalling.
      return null;
    }
    // Find any owned territory (Play.tsx deploys all reserves on `selected`).
    const owned = TERR_ORDER.filter((n) => state.territories[n]?.owner === humanId);
    if (owned.length === 0) return null;
    // Prefer an owned territory with a friendly-or-enemy neighbour (any legal target works).
    const target = owned[0];
    return target ? { type: 'reinforce', territory: target, count: me.reserves } : null;
  }

  if (state.phase === 'attack') {
    // Opportunistic single blitz: source with >=3 armies adj to enemy with <=1.
    const owned = TERR_ORDER.filter((n) => state.territories[n]?.owner === humanId);
    for (const src of owned) {
      const srcT = state.territories[src];
      if (!srcT || srcT.armies < 3) continue;
      const neighbours = ADJACENCY[src] ?? [];
      for (const adj of neighbours) {
        const tgt = state.territories[adj];
        if (!tgt || tgt.owner === null || tgt.owner === humanId) continue;
        if (tgt.armies <= 1) {
          return { type: 'attack-blitz', from: src as TerritoryName, to: adj as TerritoryName };
        }
      }
    }
    return { type: 'end-attack-phase' };
  }

  if (state.phase === 'fortify') {
    return { type: 'end-turn' };
  }

  return null;
}

describe('solo playthrough via useGame store', () => {
  it('runs a 3-player game (1 human + 2 AI) to completion', () => {
    const humanId = playerId('human');
    const ai1 = playerId('ai-1');
    const ai2 = playerId('ai-2');

    const initial = createInitialState({
      seed: SEED,
      players: [
        { id: humanId, name: 'Human', color: '#4f7dd4', isAI: false },
        { id: ai1, name: 'Ada', color: '#c94a4a', isAI: true },
        { id: ai2, name: 'Babbage', color: '#d4a24a', isAI: true },
      ],
    });

    useGame.getState().loadState(initial);

    let actions = 0;
    let iterations = 0;
    const MAX_ITER = 30000;

    while (iterations < MAX_ITER && actions < MAX_ACTIONS) {
      iterations++;
      const s = useGame.getState().state;
      if (!s) throw new Error(`store state went null at iter ${iterations}`);
      if (s.phase === 'done') break;
      if (s.turn >= MAX_TURNS) {
        throw new Error(
          `exceeded MAX_TURNS=${MAX_TURNS} without reaching done\n  state: ${stateFingerprint(s)}`,
        );
      }

      // Forced-trade gate applies to *any* seat with >=5 cards — it may fire
      // outside that player's turn, but the engine drives it via pendingForcedTrade.
      if (s.pendingForcedTrade) {
        const who = s.players.find((p) => p.id === s.pendingForcedTrade!.playerId);
        if (!who) throw new Error('pendingForcedTrade for unknown player');
        if (who.isAI) {
          const act = dilettanteTurn(s, who.id)[0];
          if (!act) {
            throw new Error(`AI could not resolve forced trade\n  state: ${stateFingerprint(s)}`);
          }
          dispatchOrFail(act, `ai-forced-trade:${who.name}`);
          actions++;
          continue;
        }
        const act = humanAction(s, humanId);
        if (!act) {
          throw new Error(`human could not resolve forced trade\n  state: ${stateFingerprint(s)}`);
        }
        dispatchOrFail(act, 'human-forced-trade');
        actions++;
        continue;
      }

      const cp = s.players[s.currentPlayerIdx];
      if (!cp) {
        throw new Error(`no current player at idx ${s.currentPlayerIdx}`);
      }

      if (cp.isAI) {
        const batch = dilettanteTurn(s, cp.id);
        if (batch.length === 0) {
          throw new Error(`AI ${cp.name} produced 0 actions\n  state: ${stateFingerprint(s)}`);
        }
        // Mirror useSoloDispatcher.runAiStep: apply actions in sequence.
        let progressed = false;
        for (const act of batch) {
          const cur = useGame.getState().state;
          if (!cur || cur.phase === 'done') break;
          try {
            useGame.getState().dispatch(act);
            actions++;
            progressed = true;
          } catch {
            // Match runAiStep's catch — bail out of the remaining batch and
            // recompute next iteration.
            break;
          }
        }
        if (!progressed) {
          throw new Error(
            `AI ${cp.name} made no progress this iteration\n  state: ${stateFingerprint(s)}`,
          );
        }
        continue;
      }

      // Human turn — play the cheapest legal action.
      if (cp.id !== humanId) {
        throw new Error(
          `non-AI player is not the expected human: ${cp.id}\n  state: ${stateFingerprint(s)}`,
        );
      }
      const act = humanAction(s, humanId);
      if (!act) {
        throw new Error(`human could not produce an action\n  state: ${stateFingerprint(s)}`);
      }
      dispatchOrFail(act, `human:${s.phase}`);
      actions++;
    }

    const final = useGame.getState().state;
    if (!final) throw new Error('store state null at end');
    if (final.phase !== 'done') {
      throw new Error(
        `game did not reach done within ${actions} actions / ${iterations} iterations\n  state: ${stateFingerprint(final)}`,
      );
    }
    expect(final.phase).toBe('done');
    expect(final.winner).toBeDefined();
  });
});
