/**
 * Lazy registry hydration for already-active rooms.
 *
 * The in-memory `registry` keeps `Room` instances alive only for the life
 * of the server process. A docker restart (or any crash) wipes them, but
 * the Postgres rows persist — `rooms.state='active'` with `current_game_id`
 * pointing at a valid `games` row. Reconnecting clients would otherwise hit
 * `ws/index.ts` and get a `ROOM_NOT_FOUND` close because `registry.get`
 * returns null.
 *
 * `ensureHydrated(roomId)` rebuilds the in-memory Room from the existing
 * games row + seat roster. Idempotent: if the Room is already in the
 * registry, it's a no-op. Returns the Room or null if no valid game row
 * exists (room is still in lobby / finished / archived, or current_game_id
 * is null).
 *
 * Contrast with `POST /launch`, which CREATES a new game via
 * `insertGameRow`. This helper only consumes an existing row.
 */

import type { GameState } from '@riskrask/engine';
import { serviceClient } from '../supabase';
import type { Room } from './Room';
import { registry } from './registry';
import type { Seat } from './seat';

export async function ensureHydrated(roomId: string): Promise<Room | null> {
  const existing = registry.get(roomId);
  if (existing) return existing;

  const svc = serviceClient();

  const { data: roomRow, error: roomErr } = await svc
    .from('rooms')
    .select('id, code, state, current_game_id')
    .eq('id', roomId)
    .maybeSingle();
  if (roomErr) {
    console.error('[hydrate] rooms select failed', { roomId, err: roomErr.message });
    return null;
  }
  const room = roomRow as {
    id: string;
    code: string | null;
    state: string;
    current_game_id: string | null;
  } | null;
  if (!room) return null;
  if (room.state !== 'active') return null;
  if (!room.current_game_id) return null;

  const { data: gameRow, error: gameErr } = await svc
    .from('games')
    .select('id, state, players')
    .eq('id', room.current_game_id)
    .maybeSingle();
  if (gameErr) {
    console.error('[hydrate] games select failed', { roomId, err: gameErr.message });
    return null;
  }
  const game = gameRow as { id: string; state: GameState; players: unknown } | null;
  if (!game) return null;

  const { data: seatsRow, error: seatsErr } = await svc
    .from('room_seats')
    .select('seat_idx, user_id, is_ai, arch_id, is_connected')
    .eq('room_id', roomId);
  if (seatsErr) {
    console.error('[hydrate] seats select failed', { roomId, err: seatsErr.message });
    return null;
  }
  const seatRows = (seatsRow ?? []) as Array<{
    seat_idx: number;
    user_id: string | null;
    is_ai: boolean;
    arch_id: string | null;
    is_connected: boolean;
  }>;

  const seats: Seat[] = seatRows
    .sort((a, b) => a.seat_idx - b.seat_idx)
    .map((r) => ({
      seatIdx: r.seat_idx,
      userId: r.user_id,
      isAi: r.is_ai,
      archId: r.arch_id,
      connected: r.is_connected,
      afk: false,
    }));

  // Double-check nothing raced in between the null check and now.
  const raced = registry.get(roomId);
  if (raced) return raced;

  registry.create(roomId, game.id, game.state, seats, {
    ...(room.code !== null ? { roomCode: room.code } : {}),
  });
  console.log('[hydrate] rebuilt in-memory room', { roomId, gameId: game.id });

  // Rebuild the in-memory event log so clients that reconnect with ?lastSeq=N
  // get a delta replay instead of a full re-hydrate. `turn_events` is our
  // only source of truth after a server restart.
  const hydratedRoom = registry.get(roomId);
  if (hydratedRoom) {
    const { data: events, error: evErr } = await svc
      .from('turn_events')
      .select('seq, turn, actor_id, action, resulting_hash')
      .eq('room_id', roomId)
      .order('seq', { ascending: true });
    if (evErr) {
      console.warn('[hydrate] turn_events fetch failed (continuing without log)', {
        roomId,
        err: evErr.message,
      });
    } else {
      const rows = (events ?? []) as Array<{
        seq: number;
        turn: number;
        actor_id: string | null;
        action: unknown;
        resulting_hash: string;
      }>;
      hydratedRoom.hydrateEventLog(
        rows.map((r) => ({
          seq: r.seq,
          turn: r.turn,
          actorId: r.actor_id,
          action: r.action as never,
          hash: r.resulting_hash,
          effects: [],
        })),
      );
    }
  }

  return registry.get(roomId) ?? null;
}
