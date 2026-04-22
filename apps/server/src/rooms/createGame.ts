/**
 * Server-direct game creation.
 *
 * Replaces the legacy `launch-game` edge-function path: instead of flipping
 * `rooms.state='active'` and waiting for a pg_net → edge-function → games
 * insert trigger chain, the HTTP `/launch` handler synchronously mints the
 * initial engine state via `@riskrask/engine.createInitialState` and writes
 * the `games` row through the service client. The in-memory Room then
 * hydrates from that state in the same request.
 *
 * Pure module. No side effects at import time.
 */

import { createInitialState } from '@riskrask/engine';
import type { GameState, PlayerConfig } from '@riskrask/engine';
import { PALETTE } from '@riskrask/engine';
import type { SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Seat row as returned by
 * `svc.from('room_seats').select('seat_idx, user_id, is_ai, arch_id')`.
 * Typed narrowly to avoid dragging the full Supabase schema in.
 */
export interface SeatRow {
  readonly seat_idx: number;
  readonly user_id: string | null;
  readonly is_ai: boolean;
  readonly arch_id: string | null;
}

export interface CreateGameResult {
  readonly gameId: string;
  readonly state: GameState;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Stable PlayerId derived from seat index. Mirrors the pattern used by
 * `mp-two-humans.test.ts` (`seat-2-ai`). We use it for AI seats because
 * they have no `user_id`; humans keep their Supabase user UUID so victory
 * resolution can map the winning PlayerId straight back to a profile.
 */
export function aiPlayerIdForSeat(seatIdx: number): string {
  return `seat-${seatIdx}-ai`;
}

/** Inverse: pull the seat index out of an AI PlayerId. Returns null if not the AI form. */
export function seatIdxFromAiPlayerId(playerId: string): number | null {
  const m = /^seat-(\d+)-ai$/.exec(playerId);
  if (!m || m[1] === undefined) return null;
  const n = Number.parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Build the engine `PlayerConfig[]` from seats sorted by seat_idx. AI seats
 * get a palette color + archetype-or-fallback display name; humans get the
 * palette color + a compact "Player N" placeholder (the real display name
 * will come through later on the welcome frame; the engine only uses
 * `name` for log strings, not authorization).
 */
export function seatsToPlayerConfigs(seats: readonly SeatRow[]): PlayerConfig[] {
  const sorted = [...seats].sort((a, b) => a.seat_idx - b.seat_idx);
  return sorted.map((s) => {
    const paletteEntry = PALETTE[s.seat_idx % PALETTE.length];
    const color = paletteEntry?.color ?? '#94a3b8';
    if (s.is_ai) {
      return {
        id: aiPlayerIdForSeat(s.seat_idx),
        name: s.arch_id ?? 'ai',
        color,
        isAI: true,
      };
    }
    // Humans: use their Supabase user UUID as the engine PlayerId so the
    // winner-resolution path can read state.winner straight back to a
    // profile without an extra lookup. If user_id is somehow null, fall
    // back to a seat-derived id to keep the engine contract valid.
    return {
      id: s.user_id ?? `seat-${s.seat_idx}-human`,
      name: `Player ${s.seat_idx + 1}`,
      color,
      isAI: false,
    };
  });
}

/**
 * Build the jsonb `players` sidecar for the games row. Mirrors the
 * per-seat metadata documented in migration 0007:
 *   [{user_id, seat_idx, color, arch_id, is_ai, display_name, ...}]
 */
export function seatsToPlayersJson(
  seats: readonly SeatRow[],
  configs: readonly PlayerConfig[],
): unknown[] {
  const byIdx = new Map(configs.map((c, i) => [i, c]));
  const sorted = [...seats].sort((a, b) => a.seat_idx - b.seat_idx);
  return sorted.map((s, i) => {
    const cfg = byIdx.get(i);
    return {
      seat_idx: s.seat_idx,
      user_id: s.user_id,
      is_ai: s.is_ai,
      arch_id: s.arch_id,
      color: cfg?.color ?? null,
      display_name: cfg?.name ?? null,
      player_id: cfg?.id ?? null,
      eliminated: false,
    };
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Insert the initial `games` row for a room and wire
 * `rooms.current_game_id` to it. Returns the generated gameId and the
 * engine state snapshot we just persisted — the caller feeds both into
 * the in-memory Room so the first WS welcome is consistent with the DB.
 *
 * Callers MUST pass a service-role client: games.state is opaque to the
 * DB and RLS on games blocks anon writes.
 */
export async function insertGameRow(
  svc: SupabaseClient,
  roomId: string,
  seats: readonly SeatRow[],
  seed?: number,
): Promise<CreateGameResult> {
  if (seats.length < 2) {
    throw new Error(`insertGameRow: need >= 2 seats, got ${seats.length}`);
  }

  const players = seatsToPlayerConfigs(seats);
  const effectiveSeed = seed ?? Date.now();
  const state = createInitialState({ seed: String(effectiveSeed), players });

  const playersJson = seatsToPlayersJson(seats, players);

  // `game_index` must be unique per (room_id, game_index). For the first
  // launch it's 1; subsequent cycles would count up, but this codepath
  // runs once per room for now (post_game/rematch is out of S3 scope).
  const { data: existingGames, error: countErr } = await svc
    .from('games')
    .select('game_index')
    .eq('room_id', roomId)
    .order('game_index', { ascending: false })
    .limit(1);
  if (countErr) {
    throw new Error(`insertGameRow: failed to read existing games — ${countErr.message}`);
  }
  const nextGameIndex =
    Array.isArray(existingGames) && existingGames.length > 0
      ? ((existingGames[0] as { game_index: number }).game_index ?? 0) + 1
      : 1;

  const { data: inserted, error: insertErr } = await svc
    .from('games')
    .insert({
      room_id: roomId,
      game_index: nextGameIndex,
      status: 'active',
      schema_version: 1,
      state: state as unknown as Record<string, unknown>,
      players: playersJson as unknown as Record<string, unknown>,
      turn_number: 1,
      turn_phase: 'setup-claim',
    })
    .select('id')
    .single();

  if (insertErr || !inserted) {
    throw new Error(
      `insertGameRow: games insert failed — ${insertErr?.message ?? 'no row returned'}`,
    );
  }
  const gameId = (inserted as { id: string }).id;

  const { error: updateErr } = await svc
    .from('rooms')
    .update({ current_game_id: gameId })
    .eq('id', roomId);
  if (updateErr) {
    throw new Error(`insertGameRow: rooms.current_game_id update failed — ${updateErr.message}`);
  }

  return { gameId, state };
}
