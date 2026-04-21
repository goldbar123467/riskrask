/**
 * Append-only turn_events writer.
 *
 * Idempotent: re-applying the same (room_id, seq) is a no-op. The table's
 * primary key is (room_id, seq); game_id is NOT NULL but not in the PK, so
 * we rely on the PK for conflict resolution.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

type AnyClient = SupabaseClient;

export interface TurnLogInput {
  readonly roomId: string;
  readonly gameId: string;
  readonly seq: number;
  readonly turn: number;
  /** null when the actor is the Neutral or an AI seat with no human behind it. */
  readonly actorId: string | null;
  readonly action: unknown;
  readonly hash: string;
}

/**
 * Insert a turn_event. Any duplicate (same room_id + seq) is silently
 * ignored. Any other error is thrown; the caller decides whether to
 * swallow (live server wants to keep broadcasting even if DB hiccups).
 */
export async function writeTurnEvent(client: AnyClient, input: TurnLogInput): Promise<void> {
  const { error } = await client.from('turn_events').upsert(
    {
      room_id: input.roomId,
      game_id: input.gameId,
      seq: input.seq,
      turn: input.turn,
      actor_id: input.actorId,
      action: input.action as Record<string, unknown>,
      resulting_hash: input.hash,
    },
    { onConflict: 'room_id,seq', ignoreDuplicates: true },
  );

  if (error) {
    throw new Error(`writeTurnEvent failed: ${error.message}`);
  }
}
