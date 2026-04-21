/**
 * AI takeover fallback for AFK / disconnected seats.
 *
 * Invoked by RoomRegistry.tick when a seat's timer runs out on their
 * turn. Delegates to `@riskrask/ai`'s `takeTurn` orchestrator, then
 * pipes each returned Action through the Room's authoritative pipeline.
 *
 * Handles the engine's forced-trade gate: the orchestrator may leave
 * `pendingForcedTrade` set if it couldn't drain it in one pass (shouldn't
 * happen in practice, but the gate is cheap). We re-invoke up to a small
 * fixed bound.
 */

import { takeTurn } from '@riskrask/ai';
import { createRng } from '@riskrask/engine';
import type { Action } from '@riskrask/engine';
import type { Room } from '../rooms/Room';

const MAX_FALLBACK_PASSES = 4;

/** Injection point for tests — swap out the orchestrator. */
export type TakeTurnFn = typeof takeTurn;

export async function runFallbackTurn(
  room: Room,
  seatIdx: number,
  takeTurnImpl: TakeTurnFn = takeTurn,
): Promise<void> {
  const seat = room.getSeat(seatIdx);
  if (!seat) return;
  const archId = seat.archId ?? 'default';

  // Announce takeover to every connected client.
  room.broadcast({ type: 'ai-takeover', seatIdx });

  for (let pass = 0; pass < MAX_FALLBACK_PASSES; pass++) {
    const state = room.getState();
    if (state.winner) return;

    const current = state.players[state.currentPlayerIdx];
    if (!current) return;
    // Only drive the seat if it's actually their turn.
    if (state.currentPlayerIdx !== seatIdx) return;

    const rng = createRng(`${room.gameId}:fallback:${seatIdx}:${pass}:${room.getSeq()}`);
    const actions: Action[] = takeTurnImpl(state, current.id, rng, archId);
    if (actions.length === 0) return;

    for (const action of actions) {
      try {
        await room.applyAsCurrent(action);
      } catch (err) {
        console.warn('[fallback] apply failed', {
          roomId: room.roomId,
          seatIdx,
          action,
          err: err instanceof Error ? err.message : String(err),
        });
        return;
      }
      // If the engine auto-advanced away from this seat (e.g. fortify),
      // stop — next tick will pick up the new current seat.
      const nextState = room.getState();
      if (nextState.currentPlayerIdx !== seatIdx) return;
      if (nextState.winner) return;
    }

    // If we still have a pending forced trade on this seat, loop.
    const after = room.getState();
    if (!after.pendingForcedTrade || after.pendingForcedTrade.playerId !== current.id) return;
  }
}
