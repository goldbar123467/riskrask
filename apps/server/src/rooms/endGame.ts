/**
 * End-of-game handler.
 *
 * Fires exactly once per room when the engine first sets `state.winner`.
 * Responsibilities, in order:
 *   1. Resolve winner identifiers from the room's seats + finalState.
 *   2. Broadcast a `game_over` frame to all attached sockets.
 *   3. Call the `end_game` SQL RPC to flip `rooms.state='finished'` and
 *      stamp the games row. Errors are logged — in-memory cleanup still
 *      runs so the Room doesn't leak.
 *   4. Wait ~500ms for the frame to flush over the wire.
 *   5. `room.shutdown('game-over')` + `registry.delete(roomId)`.
 *
 * All external dependencies (registry, service client, sleep) are
 * injected so this module is unit-testable without a running server.
 */

import type { GameState } from '@riskrask/engine';
import type { Room } from './Room';
import type { RoomRegistry } from './registry';

/** Minimum shape of `TypedSupabaseClient` we touch — used for typing the test double. */
export interface EndGameSupabaseClient {
  rpc(
    fn: 'end_game',
    args: { p_room_id: string; p_winner_user_id: string | null },
  ): Promise<{ data: unknown; error: { message: string } | null }>;
}

export interface HandleGameOverDeps {
  registry: Pick<RoomRegistry, 'get' | 'delete'>;
  /**
   * Factory that returns a Supabase client bound to the service role key.
   * Invoked lazily so test harnesses don't need env vars.
   */
  serviceClient: () => EndGameSupabaseClient;
  /** Overrideable flush delay. Defaults to 500ms. Set to 0 in tests. */
  flushDelayMs?: number;
  /** Overrideable sleep — defaults to `setTimeout`. */
  sleep?: (ms: number) => Promise<void>;
}

const DEFAULT_FLUSH_DELAY_MS = 500;

export async function handleGameOver(
  roomId: string,
  winnerPlayerId: string,
  finalState: GameState,
  deps: HandleGameOverDeps,
): Promise<void> {
  const room: Room | undefined = deps.registry.get(roomId);
  if (!room || room.isTerminated()) return;

  const { winnerSeatIdx, winnerUserId, winnerDisplay } = resolveWinner(
    room,
    finalState,
    winnerPlayerId,
  );

  // 1) Broadcast terminal frame. Done before the RPC so the client UI can
  //    react even if persistence fails.
  room.broadcast({
    type: 'game_over',
    winnerPlayerId,
    winnerSeatIdx,
    winnerUserId,
    winnerDisplay,
    finalHash: room.getHash(),
    finalSeq: room.getSeq(),
  });

  // 2) Persist. Log-and-continue — in-memory cleanup must still run.
  try {
    const { error } = await deps.serviceClient().rpc('end_game', {
      p_room_id: roomId,
      p_winner_user_id: winnerUserId,
    });
    if (error) {
      console.warn('[endGame] end_game RPC returned error', {
        roomId,
        err: error.message,
      });
    }
  } catch (err) {
    console.warn('[endGame] end_game RPC threw', {
      roomId,
      err: err instanceof Error ? err.message : String(err),
    });
  }

  // 3) Let the broadcast flush across the wire before we close sockets.
  const delay = deps.flushDelayMs ?? DEFAULT_FLUSH_DELAY_MS;
  if (delay > 0) {
    const sleep = deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
    await sleep(delay);
  }

  // 4) Tear down. `shutdown` flips `terminated` first so any in-flight
  //    AI fallback loop sees GAME_TERMINATED and bails cleanly.
  room.shutdown('game-over');
  deps.registry.delete(roomId);
}

interface ResolvedWinner {
  winnerSeatIdx: number | null;
  winnerUserId: string | null;
  winnerDisplay: string;
}

function resolveWinner(room: Room, state: GameState, winnerPlayerId: string): ResolvedWinner {
  const player = state.players.find((p) => p.id === winnerPlayerId);
  const seats = room.getSeats();
  const playerIdx = state.players.findIndex((p) => p.id === winnerPlayerId);
  // Seat-index is the player-index by construction (createInitialState lays
  // them out in the same order the seats arrive). Use the seat array as the
  // source of truth for `userId` so AI seats surface as `null`.
  const seat = playerIdx >= 0 ? seats[playerIdx] : undefined;
  return {
    winnerSeatIdx: seat ? seat.seatIdx : null,
    winnerUserId: seat ? seat.userId : null,
    winnerDisplay: player?.name ?? 'Unknown',
  };
}
