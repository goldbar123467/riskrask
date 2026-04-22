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
  name: z.string().trim().min(1).max(80).optional(),
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
    p_name: body.name ?? null,
  });
  if (error) {
    return c.json(errBody('CREATE_FAILED', error.message), 500);
  }
  return c.json({ ok: true, room: data }, 200);
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
  return c.json({ ok: true, room: data }, 200);
});

// ---------------------------------------------------------------------------
// POST /api/rooms/:id/leave
// ---------------------------------------------------------------------------
roomsRouter.post('/:id/leave', async (c) => {
  const jwt = bearer(c.req.header('Authorization'));
  if (!jwt) return c.json(errBody('UNAUTHORIZED'), 401);

  const id = c.req.param('id');
  const client = anonClient(jwt) as unknown as AnyClient;
  const { error } = await client.rpc('leave_room', { p_room_id: id });
  if (error) return c.json(errBody('LEAVE_FAILED', error.message), 400);
  return c.json({ ok: true }, 200);
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
  return c.json({ ok: true }, 200);
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
  return c.json({ ok: true }, 200);
});

// ---------------------------------------------------------------------------
// POST /api/rooms/:id/launch
// ---------------------------------------------------------------------------
roomsRouter.post('/:id/launch', async (c) => {
  const jwt = bearer(c.req.header('Authorization'));
  if (!jwt) return c.json(errBody('UNAUTHORIZED'), 401);

  const id = c.req.param('id');
  const userClient = anonClient(jwt) as unknown as AnyClient;
  const { error } = await userClient.rpc('launch_game', { p_room_id: id });
  if (error) return c.json(errBody('LAUNCH_FAILED', error.message), 400);

  // Hydrate the in-memory Room from the games row the launch trigger
  // created. The service client is used here — reads of the game state
  // bypass RLS to ensure the server always has a canonical view.
  try {
    const svc = serviceClient();
    const roomRow = await svc
      .from('rooms')
      .select('id, code, current_game_id')
      .eq('id', id)
      .maybeSingle();

    const currentGameId =
      (roomRow.data as { current_game_id?: string | null } | null)?.current_game_id ?? null;
    if (!currentGameId) {
      // The launch trigger is asynchronous via pg_net in some deployments;
      // the caller can poll via GET /api/rooms/:id. Don't hard-fail.
      return c.json({ ok: true, roomId: id, hydrated: false }, 200);
    }

    const gameRow = await svc
      .from('games')
      .select('id, state, players')
      .eq('id', currentGameId)
      .maybeSingle();
    const game = gameRow.data as { id: string; state: unknown; players: unknown } | null;
    if (!game) {
      return c.json({ ok: true, roomId: id, hydrated: false }, 200);
    }

    const seatsRow = await svc
      .from('room_seats')
      .select('seat_idx, user_id, is_ai, arch_id, is_connected')
      .eq('room_id', id);
    const seatRows = (seatsRow.data ?? []) as Array<{
      seat_idx: number;
      user_id: string | null;
      is_ai: boolean;
      arch_id: string | null;
      is_connected: boolean;
    }>;
    const seats: Seat[] = seatRows.map((r) => ({
      seatIdx: r.seat_idx,
      userId: r.user_id,
      isAi: r.is_ai,
      archId: r.arch_id,
      connected: r.is_connected,
      afk: false,
    }));

    const roomCode = (roomRow.data as { code?: string | null } | null)?.code ?? undefined;
    registry.create(id, game.id, game.state as never, seats, {
      ...(roomCode !== undefined ? { roomCode } : {}),
    });
    return c.json({ ok: true, roomId: id, hydrated: true, gameId: game.id }, 200);
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
  return c.json({ ok: true, rooms }, 200);
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
  return c.json({ ok: true, rooms }, 200);
});

// ---------------------------------------------------------------------------
// GET /api/rooms/:id
// ---------------------------------------------------------------------------
roomsRouter.get('/:id', async (c) => {
  const id = c.req.param('id');
  const svc = serviceClient();
  const { data: roomRow, error: roomErr } = await svc
    .from('rooms')
    .select('id, code, state, current_game_id')
    .eq('id', id)
    .maybeSingle();
  if (roomErr) return c.json(errBody('FETCH_FAILED', roomErr.message), 500);
  if (!roomRow) return c.json(errBody('ROOM_NOT_FOUND'), 404);

  const row = roomRow as {
    id: string;
    code: string;
    state: string;
    current_game_id: string | null;
  };
  if (!row.current_game_id) {
    return c.json({ ok: true, room: row, game: null }, 200);
  }
  const { data: gameRow, error: gameErr } = await svc
    .from('games')
    .select('id, state, players, turn_number, turn_phase, last_hash')
    .eq('id', row.current_game_id)
    .maybeSingle();
  if (gameErr) return c.json(errBody('FETCH_FAILED', gameErr.message), 500);
  return c.json({ ok: true, room: row, game: gameRow ?? null }, 200);
});

export { roomsRouter };
