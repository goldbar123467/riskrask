/**
 * Server-side seat autofill for `POST /api/rooms/:id/launch`.
 *
 * The host pushes LAUNCH even if seats are empty; we want empty slots
 * filled with a random archetype pick so the game actually has enough
 * players. `add_ai_seat` runs under the host's JWT (host-only RPC) and
 * lives behind the 9-archetype whitelist widened in migration 0018.
 *
 * Sequential, not concurrent. `add_ai_seat` derives the seat index from
 * `room_seats` state at insert time, so firing two calls in parallel
 * would make two inserts race for the same seat_idx. One at a time.
 */

import { ARCH_IDS } from '@riskrask/ai';
import type { SupabaseClient } from '@supabase/supabase-js';
import { anonClient } from '../supabase';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SeatIdxRow {
  readonly seat_idx: number;
}

export interface AutofillResult {
  readonly filled: number;
}

/**
 * Signature of the helper that builds a user-scoped Supabase client from
 * a raw JWT. Injected in tests; production uses `anonClient` from
 * `../supabase`.
 */
export type AnonClientFactory = (jwt: string) => SupabaseClient;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fill every empty seat in `[0, maxPlayers)` with a random AI archetype.
 * `svc` is the service-role client (used to read the current seat map);
 * each `add_ai_seat` RPC runs under the host JWT so the SECURITY DEFINER
 * `is_room_host` check passes.
 *
 * Fails on the first RPC error with a labelled `AUTOFILL_FAILED:` message
 * — the caller decides whether to 5xx, but idempotent retry is safe
 * because already-filled seats are skipped.
 */
export async function fillEmptySeats(
  svc: SupabaseClient,
  hostJwt: string,
  roomId: string,
  maxPlayers: number,
  /** Injectables for tests. */
  deps: {
    readonly rng?: () => number;
    readonly makeAnonClient?: AnonClientFactory;
  } = {},
): Promise<AutofillResult> {
  const rng = deps.rng ?? Math.random;
  const makeAnonClient =
    deps.makeAnonClient ?? ((jwt) => anonClient(jwt) as unknown as SupabaseClient);

  const { data, error } = await svc
    .from('room_seats')
    .select('seat_idx')
    .eq('room_id', roomId)
    .is('left_at', null);

  if (error) {
    throw new Error(`AUTOFILL_FAILED: could not read room_seats: ${error.message}`);
  }
  const rows = (data ?? []) as SeatIdxRow[];
  const occupied = new Set<number>(rows.map((r) => r.seat_idx));

  const gaps: number[] = [];
  for (let i = 0; i < maxPlayers; i++) {
    if (!occupied.has(i)) gaps.push(i);
  }

  if (gaps.length === 0) return { filled: 0 };

  const client = makeAnonClient(hostJwt);
  let filled = 0;
  for (const seatIdx of gaps) {
    const idx = Math.floor(rng() * ARCH_IDS.length);
    const archId = ARCH_IDS[idx] ?? ARCH_IDS[0]!;
    const { error: rpcErr } = await client.rpc('add_ai_seat', {
      p_room_id: roomId,
      p_arch_id: archId,
    });
    if (rpcErr) {
      throw new Error(`AUTOFILL_FAILED: seat ${seatIdx}: ${rpcErr.message}`);
    }
    filled += 1;
  }

  return { filled };
}
