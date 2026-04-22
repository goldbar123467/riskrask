/**
 * Room lifecycle REST routes.
 *
 * POST   /api/rooms                 — create a room (auth required)
 * POST   /api/rooms/:id/join        — join by invite code
 * POST   /api/rooms/:id/leave       — leave current seat
 * POST   /api/rooms/:id/launch      — host-only launch → hydrate in-memory Room
 * POST   /api/rooms/:id/ready       — toggle seat ready
 * POST   /api/rooms/:id/ai-seat     — host-only add AI seat
 * GET    /api/rooms                 — list public rooms by state
 * GET    /api/rooms/mine            — rooms the caller holds an active seat in
 * GET    /api/rooms/:id             — fetch current game snapshot
 *
 * Write paths call Postgres RPCs via the user-scoped anon client so
 * RLS / host-only checks happen at the database layer. Reads use the
 * service client for efficiency (rooms list is public) or anon-scoped
 * reads for game snapshots.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { Hono } from 'hono';
import { z } from 'zod';
import { verifySupabaseJwt } from '../auth/verify';
import { fillEmptySeats } from '../rooms/autofill';
import { insertGameRow, type SeatRow } from '../rooms/createGame';
import { registry } from '../rooms/registry';
import type { Seat } from '../rooms/seat';
import { anonClient, serviceClient } from '../supabase';

// The typed `Database` schema in supabase.ts intentionally omits room RPCs
// to keep the compile surface tight. We widen here at the call site.
type AnyClient = SupabaseClient;

const roomsRouter = new Hono();

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------
const CreateRoomBody = z.object({
  visibility: z.enum(['public', 'private']).default('public'),
  maxPlayers: z.number().int().min(2).max(6).default(6),
  settings: z.record(z.unknown()).default({}),
  name: z.string().trim().min(1).max(80),
});

const JoinBody = z.object({ code: z.string().min(1) });
const ReadyBody = z.object({ ready: z.boolean() });
const AiSeatBody = z.object({ archId: z.string().min(1) });

const ListQuery = z.object({
  visibility: z.enum(['public', 'private']).optional(),
  state: z.enum(['lobby', 'active', 'post_game', 'countdown', 'finished', 'archived']).optional(),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function bearer(authHeader: string | null | undefined): string | null {
  if (!authHeader) return null;
  const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();
  return jwt || null;
}

function errBody(code: string, detail?: string) {
  return detail !== undefined ? { ok: false, code, detail } : { ok: false, code };
}

// ---------------------------------------------------------------------------
// POST /api/rooms
// ---------------------------------------------------------------------------
roomsRouter.post('/', async (c) => {
  const user = await verifySupabaseJwt(c.req.header('Authorization') ?? null);
  if (!user) return c.json(errBody('UNAUTHORIZED'), 401);

  let body: z.infer<typeof CreateRoomBody>;
  try {
    body = CreateRoomBody.parse(await c.req.json());
  } catch {
    return c.json(errBody('INVALID_REQUEST', 'invalid body shape'), 400);
  }

  const jwt = bearer(c.req.header('Authorization'));
  if (!jwt) return c.json(errBody('UNAUTHORIZED'), 401);

  const client = anonClient(jwt) as unknown as AnyClient;
  const { data, error } = await client.rpc('create_room', {
    p_visibility: body.visibility,
    p_max_players: body.maxPlayers,
    p_settings: body.settings as Record<string, unknown>,
    p_name: body.name,
  });
  if (error) {
    return c.json(errBody('CREATE_FAILED', error.message), 500);
  }
  return c.json({ ok: true, data: { room: data } }, 200);
});

// ---------------------------------------------------------------------------
// POST /api/rooms/:id/join
// ---------------------------------------------------------------------------
roomsRouter.post('/:id/join', async (c) => {
  const jwt = bearer(c.req.header('Authorization'));
  if (!jwt) return c.json(errBody('UNAUTHORIZED'), 401);

  let body: z.infer<typeof JoinBody>;
  try {
    body = JoinBody.parse(await c.req.json());
  } catch {
    return c.json(errBody('INVALID_REQUEST', 'code required'), 400);
  }

  const client = anonClient(jwt) as unknown as AnyClient;
  const { data, error } = await client.rpc('join_room', { p_code: body.code });
  if (error) {
    return c.json(errBody('JOIN_FAILED', error.message), 400);
  }
  return c.json({ ok: true, data: { room: data } }, 200);
});

// ---------------------------------------------------------------------------
// POST /api/rooms/:id/leave
// ---------------------------------------------------------------------------
roomsRouter.post('/:id/leave', async (c) => {
  const jwt = bearer(c.req.header('Authorization'));
  if (!jwt) return c.json(errBody('UNAUTHORIZED'), 401);

  const id = c.req.param('id');
  const client = anonClient(jwt) as unknown as AnyClient;
  // Migration 0020 made leave_room a TABLE-returning function; supabase-js
  // surfaces that as an array of rows. A well-formed call returns exactly one
  // row. If anything unexpected comes back we fall back to the pre-0020
  // shape (`roomDeleted: false, newHostId: null`) so the client doesn't
  // accidentally navigate away.
  const { data, error } = await client.rpc('leave_room', { p_room_id: id });
  if (error) return c.json(errBody('LEAVE_FAILED', error.message), 400);
  const rows = (Array.isArray(data) ? data : []) as Array<{
    room_deleted: boolean;
    new_host_id: string | null;
  }>;
  const row = rows[0];
  return c.json(
    {
      ok: true,
      data: {
        roomDeleted: Boolean(row?.room_deleted),
        newHostId: row?.new_host_id ?? null,
      },
    },
    200,
  );
});

// ---------------------------------------------------------------------------
// POST /api/rooms/:id/ready
// ---------------------------------------------------------------------------
roomsRouter.post('/:id/ready', async (c) => {
  const jwt = bearer(c.req.header('Authorization'));
  if (!jwt) return c.json(errBody('UNAUTHORIZED'), 401);

  let body: z.infer<typeof ReadyBody>;
  try {
    body = ReadyBody.parse(await c.req.json());
  } catch {
    return c.json(errBody('INVALID_REQUEST'), 400);
  }

  const id = c.req.param('id');
  const client = anonClient(jwt) as unknown as AnyClient;
  const { error } = await client.rpc('set_ready', { p_room_id: id, p_ready: body.ready });
  if (error) return c.json(errBody('READY_FAILED', error.message), 400);
  return c.json({ ok: true, data: {} }, 200);
});

// ---------------------------------------------------------------------------
// POST /api/rooms/:id/ai-seat
// ---------------------------------------------------------------------------
roomsRouter.post('/:id/ai-seat', async (c) => {
  const jwt = bearer(c.req.header('Authorization'));
  if (!jwt) return c.json(errBody('UNAUTHORIZED'), 401);

  let body: z.infer<typeof AiSeatBody>;
  try {
    body = AiSeatBody.parse(await c.req.json());
  } catch {
    return c.json(errBody('INVALID_REQUEST', 'archId required'), 400);
  }

  const id = c.req.param('id');
  const client = anonClient(jwt) as unknown as AnyClient;
  const { error } = await client.rpc('add_ai_seat', { p_room_id: id, p_arch_id: body.archId });
  if (error) return c.json(errBody('AI_SEAT_FAILED', error.message), 400);
  return c.json({ ok: true, data: {} }, 200);
});

// ---------------------------------------------------------------------------
// POST /api/rooms/:id/launch
//
// Flow:
//   1. Auth → host-jwt presence check.
//   2. Service-client read of rooms(max_players, code) — we need both
//      for autofill and for the Room hydration below.
//   3. `fillEmptySeats` — seeds any gaps with random AI archetypes under
//      the host JWT (RPC is host-only at the DB). Any failure aborts the
//      launch with AUTOFILL_FAILED; the host can safely retry — the RPC
//      is idempotent because already-filled seats are skipped.
//   4. `launch_game` RPC (flips rooms.state='active' — the only thing
//      that step still does now that the launch-trigger path is dead).
//   5. `insertGameRow` — creates the games row directly via service
//      client and links rooms.current_game_id. Replaces the old wait-
//      for-trigger block.
//   6. Re-read seats + hydrate the in-memory Room.
//
// Response is `{ ok, data: { roomId, gameId, hydrated } }` to match the
// data-wrapper convention from commit 29b152d.
// ---------------------------------------------------------------------------
roomsRouter.post('/:id/launch', async (c) => {
  const jwt = bearer(c.req.header('Authorization'));
  if (!jwt) return c.json(errBody('UNAUTHORIZED'), 401);

  const id = c.req.param('id');
  const svc = serviceClient();

  // Step 2: pull the room metadata we need up front. If the room doesn't
  // exist or the caller can't see it, bail before spending RPC budget on
  // autofill. `max_players` and `code` are both required below.
  const roomMeta = await svc
    .from('rooms')
    .select('id, code, max_players')
    .eq('id', id)
    .maybeSingle();
  const roomData = roomMeta.data as {
    id: string;
    code: string | null;
    max_players: number;
  } | null;
  if (roomMeta.error) {
    return c.json(errBody('LAUNCH_FAILED', roomMeta.error.message), 500);
  }
  if (!roomData) {
    return c.json(errBody('ROOM_NOT_FOUND'), 404);
  }

  // Step 3: autofill empty seats. Failure here 5xxs — the host retries.
  try {
    await fillEmptySeats(svc, jwt, id, roomData.max_players);
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'unknown';
    return c.json({ ok: false, code: 'AUTOFILL_FAILED', detail }, 500);
  }

  // Step 4: flip the room into 'active'. Host-only; RLS is enforced by
  // the RPC itself (SECURITY DEFINER with a manual is_host check).
  const userClient = anonClient(jwt) as unknown as AnyClient;
  const { error } = await userClient.rpc('launch_game', { p_room_id: id });
  if (error) return c.json(errBody('LAUNCH_FAILED', error.message), 400);

  // Step 5 + 6: server-direct game creation + Room hydration.
  try {
    const seatsRow = await svc
      .from('room_seats')
      .select('seat_idx, user_id, is_ai, arch_id, is_connected')
      .eq('room_id', id);
    if (seatsRow.error) {
      return c.json(errBody('HYDRATE_FAILED', seatsRow.error.message), 500);
    }
    const seatRows = (seatsRow.data ?? []) as Array<{
      seat_idx: number;
      user_id: string | null;
      is_ai: boolean;
      arch_id: string | null;
      is_connected: boolean;
    }>;

    const seatRowsForEngine: SeatRow[] = seatRows.map((r) => ({
      seat_idx: r.seat_idx,
      user_id: r.user_id,
      is_ai: r.is_ai,
      arch_id: r.arch_id,
    }));

    const { gameId, state } = await insertGameRow(svc, id, seatRowsForEngine);

    const seats: Seat[] = seatRows.map((r) => ({
      seatIdx: r.seat_idx,
      userId: r.user_id,
      isAi: r.is_ai,
      archId: r.arch_id,
      connected: r.is_connected,
      afk: false,
    }));

    const roomCode = roomData.code ?? undefined;
    registry.create(id, gameId, state, seats, {
      ...(roomCode !== undefined ? { roomCode } : {}),
    });

    // TODO(s3-agent2): TurnDriver.start fires inside registry.create — confirm after merge.
    return c.json({ ok: true, data: { roomId: id, gameId, hydrated: true } }, 200);
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'unknown';
    return c.json(errBody('HYDRATE_FAILED', detail), 500);
  }
});

// ---------------------------------------------------------------------------
// GET /api/rooms (list)
// ---------------------------------------------------------------------------
roomsRouter.get('/', async (c) => {
  const query = ListQuery.safeParse({
    visibility: c.req.query('visibility'),
    state: c.req.query('state'),
  });
  if (!query.success) return c.json(errBody('INVALID_REQUEST'), 400);

  const svc = serviceClient();
  let q = svc
    .from('rooms')
    .select('id, code, name, state, visibility, host_id, created_at, room_seats(seat_idx)')
    .order('created_at', { ascending: false })
    .limit(50);
  if (query.data.visibility) q = q.eq('visibility', query.data.visibility);
  if (query.data.state) q = q.eq('state', query.data.state);

  const { data, error } = await q;
  if (error) return c.json(errBody('LIST_FAILED', error.message), 500);

  const rows = (data ?? []) as Array<{
    id: string;
    code: string;
    name: string | null;
    state: string;
    visibility: string;
    host_id: string;
    created_at: string;
    room_seats: Array<{ seat_idx: number }>;
  }>;
  const rooms = rows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    state: r.state,
    visibility: r.visibility,
    hostId: r.host_id,
    createdAt: r.created_at,
    seatCount: r.room_seats?.length ?? 0,
  }));
  return c.json({ ok: true, data: { rooms } }, 200);
});

// ---------------------------------------------------------------------------
// GET /api/rooms/mine
// Rooms the caller currently holds an active seat in. Registered before
// `/:id` so Hono's router matches the literal path first.
// ---------------------------------------------------------------------------
roomsRouter.get('/mine', async (c) => {
  const jwt = bearer(c.req.header('Authorization'));
  if (!jwt) return c.json(errBody('UNAUTHORIZED'), 401);

  const user = await verifySupabaseJwt(c.req.header('Authorization') ?? null);
  if (!user) return c.json(errBody('UNAUTHORIZED'), 401);

  const client = anonClient(jwt) as unknown as AnyClient;
  const { data, error } = await client.rpc('list_my_rooms');
  if (error) return c.json(errBody('LIST_FAILED', error.message), 500);

  const rows = (data ?? []) as Array<{
    id: string;
    code: string;
    name: string | null;
    state: string;
    visibility: string;
    max_players: number;
    host_id: string;
    created_at: string;
    seat_count: number;
    my_seat_idx: number;
  }>;
  const rooms = rows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    state: r.state,
    visibility: r.visibility,
    maxPlayers: r.max_players,
    hostId: r.host_id,
    createdAt: r.created_at,
    seatCount: r.seat_count,
    mySeatIdx: r.my_seat_idx,
  }));
  return c.json({ ok: true, data: { rooms } }, 200);
});

// ---------------------------------------------------------------------------
// GET /api/rooms/:id
//
// Returns the room header, the current game snapshot (if any), and the seat
// list with resolved display names. `winner_id` + `finished_at` are selected
// in addition to `state` so the client's reconnect fallback can tell that a
// room finished while the client was gone and redirect without waiting for
// the stale ws `game_over`. The seat query joins `profiles` in a second
// round-trip rather than via PostgREST's relationship syntax to keep the
// Database type stub in supabase.ts minimal; two selects is cheap compared
// to the latency of a single request.
// ---------------------------------------------------------------------------
roomsRouter.get('/:id', async (c) => {
  const id = c.req.param('id');
  const svc = serviceClient();
  const { data: roomRow, error: roomErr } = await svc
    .from('rooms')
    .select('id, code, state, current_game_id, winner_id, finished_at')
    .eq('id', id)
    .maybeSingle();
  if (roomErr) return c.json(errBody('FETCH_FAILED', roomErr.message), 500);
  if (!roomRow) return c.json(errBody('ROOM_NOT_FOUND'), 404);

  const row = roomRow as {
    id: string;
    code: string;
    state: string;
    current_game_id: string | null;
    winner_id: string | null;
    finished_at: string | null;
  };

  // --- seats + display names ---------------------------------------------
  const { data: seatRows, error: seatsErr } = await svc
    .from('room_seats')
    .select('seat_idx, user_id, is_ai, arch_id, is_ready, is_connected')
    .eq('room_id', id);
  if (seatsErr) return c.json(errBody('FETCH_FAILED', seatsErr.message), 500);

  const rawSeats = (seatRows ?? []) as Array<{
    seat_idx: number;
    user_id: string | null;
    is_ai: boolean;
    arch_id: string | null;
    is_ready: boolean;
    is_connected: boolean;
  }>;

  // Fetch profile rows in a single IN(...) query. AI seats (user_id === null)
  // contribute nothing.
  const humanUserIds = Array.from(
    new Set(
      rawSeats.map((s) => s.user_id).filter((uid): uid is string => uid !== null && uid !== ''),
    ),
  );
  const profileByUserId = new Map<
    string,
    { displayName: string | null; username: string | null }
  >();
  if (humanUserIds.length > 0) {
    const { data: profileRows, error: profilesErr } = await svc
      .from('profiles')
      .select('id, display_name, username')
      .in('id', humanUserIds);
    if (profilesErr) return c.json(errBody('FETCH_FAILED', profilesErr.message), 500);
    for (const p of (profileRows ?? []) as Array<{
      id: string;
      display_name: string | null;
      username: string | null;
    }>) {
      profileByUserId.set(p.id, { displayName: p.display_name, username: p.username });
    }
  }

  const seats = rawSeats
    .sort((a, b) => a.seat_idx - b.seat_idx)
    .map((s) => {
      const prof = s.user_id ? (profileByUserId.get(s.user_id) ?? null) : null;
      const displayName = prof ? (prof.displayName ?? prof.username ?? null) : null;
      return {
        seatIdx: s.seat_idx,
        userId: s.user_id,
        isAi: s.is_ai,
        archId: s.arch_id,
        ready: s.is_ready,
        connected: s.is_connected,
        displayName,
      };
    });

  const roomOut = { ...row, seats };

  if (!row.current_game_id) {
    return c.json({ ok: true, data: { room: roomOut, game: null } }, 200);
  }
  const { data: gameRow, error: gameErr } = await svc
    .from('games')
    .select('id, state, players, turn_number, turn_phase, last_hash')
    .eq('id', row.current_game_id)
    .maybeSingle();
  if (gameErr) return c.json(errBody('FETCH_FAILED', gameErr.message), 500);
  return c.json({ ok: true, data: { room: roomOut, game: gameRow ?? null } }, 200);
});

export { roomsRouter };
