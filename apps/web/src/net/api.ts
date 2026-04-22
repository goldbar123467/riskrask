import type { GameState } from '@riskrask/engine';

type ApiOk<T> = { ok: true; data: T };
type ApiErr = { ok: false; code: string; detail?: string };
export type ApiResult<T> = ApiOk<T> | ApiErr;

// API origin is configured via VITE_API_URL at build time
// (see apps/web/.env.production). Empty string → same-origin `/api` for local dev.
const API_ORIGIN = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
const BASE = `${API_ORIGIN}/api`;

async function post<T>(path: string, body: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as ApiResult<T>;
    return json;
  } catch (e) {
    return { ok: false, code: 'NETWORK_ERROR', detail: String(e) };
  }
}

async function get<T>(path: string): Promise<ApiResult<T>> {
  try {
    const res = await fetch(`${BASE}${path}`);
    if (res.status === 404) return { ok: false, code: 'SAVE_NOT_FOUND' };
    if (res.status === 410) return { ok: false, code: 'SAVE_EXPIRED' };
    const json = (await res.json()) as ApiResult<T>;
    return json;
  } catch (e) {
    return { ok: false, code: 'NETWORK_ERROR', detail: String(e) };
  }
}

// ---------------------------------------------------------------------------
// Authenticated variants — attach a Bearer token for room REST.
// The server's room routes enforce RLS via Supabase's user-scoped anon client;
// the JWT is the only thing that identifies the caller.
// ---------------------------------------------------------------------------

async function authPost<T>(path: string, body: unknown, token: string): Promise<ApiResult<T>> {
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as ApiResult<T>;
    return json;
  } catch (e) {
    return { ok: false, code: 'NETWORK_ERROR', detail: String(e) };
  }
}

async function authGet<T>(path: string, token: string): Promise<ApiResult<T>> {
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = (await res.json()) as ApiResult<T>;
    return json;
  } catch (e) {
    return { ok: false, code: 'NETWORK_ERROR', detail: String(e) };
  }
}

// ---------------------------------------------------------------------------
// Save codes (existing)
// ---------------------------------------------------------------------------

export interface SaveResponse {
  code: string;
}

export interface LoadResponse {
  state: GameState;
}

/** POST /api/saves — creates a new save and returns the 8-char code */
export function createSave(state: GameState): Promise<ApiResult<SaveResponse>> {
  return post<SaveResponse>('/saves', { state });
}

/** GET /api/saves/:code — loads a save by code */
export function loadSave(code: string): Promise<ApiResult<LoadResponse>> {
  return get<LoadResponse>(`/saves/${code}`);
}

// ---------------------------------------------------------------------------
// Rooms — typed client surface. Server is the source of truth; these mirror
// the shapes returned by `/api/rooms` and `/api/rooms/:id` in apps/server.
// ---------------------------------------------------------------------------

/** Summary row for the public-room list. */
export interface RoomSummary {
  id: string;
  code: string;
  name: string | null;
  state: 'lobby' | 'active' | 'post_game' | 'countdown' | 'finished' | 'archived';
  visibility: 'public' | 'private';
  hostId: string;
  createdAt: string;
  seatCount: number;
  /**
   * Present on `/rooms/mine` responses — the seat index held by the caller
   * in this room. Undefined on public-list rows (caller isn't a member).
   */
  mySeatIdx?: number | null;
}

/** Seat row surfaced on the room-detail view. Mirrors `room_seats`. */
export interface RoomSeat {
  seatIdx: number;
  userId: string | null;
  isAi: boolean;
  archId: string | null;
  ready: boolean;
  connected: boolean;
  displayName?: string | null;
}

/**
 * Detail row for a single room. `seats` / `maxPlayers` / `hostId` are
 * tolerated-as-optional because the server's `GET /api/rooms/:id` is still
 * evolving — when absent the UI falls back to placeholders.
 */
export interface RoomDetail {
  id: string;
  code: string;
  name?: string | null;
  state: RoomSummary['state'];
  currentGameId?: string | null;
  visibility?: 'public' | 'private';
  hostId?: string;
  maxPlayers?: number;
  seats?: RoomSeat[];
}

/** Game snapshot returned alongside a room when one has launched. */
export interface GameSummary {
  id: string;
  turnNumber?: number;
  turnPhase?: string;
  lastHash?: string;
  players?: unknown;
  state?: unknown;
}

export interface CreateRoomBody {
  visibility: 'public' | 'private';
  maxPlayers: number;
  /** Required human-readable label. Server trims + enforces length 1..80. */
  name: string;
}

/** GET /api/rooms — list public rooms in the lobby state, newest first. */
export function listPublicRooms(token: string): Promise<ApiResult<{ rooms: RoomSummary[] }>> {
  return authGet<{ rooms: RoomSummary[] }>('/rooms?visibility=public&state=lobby', token);
}

/**
 * GET /api/rooms/mine — rooms the caller currently occupies (any state). Used
 * by the lobby's "My Rooms" tab. Server filters by the caller's user id.
 */
export function listMyRooms(token: string): Promise<ApiResult<{ rooms: RoomSummary[] }>> {
  return authGet<{ rooms: RoomSummary[] }>('/rooms/mine', token);
}

/** POST /api/rooms — create a new room. */
export function createRoom(
  body: CreateRoomBody,
  token: string,
): Promise<ApiResult<{ room: RoomDetail }>> {
  return authPost<{ room: RoomDetail }>('/rooms', body, token);
}

/**
 * POST /api/rooms/:id/join — join by invite code. The server resolves the
 * target room from `body.code`; the `:id` path segment is unused, so we pass
 * a stable placeholder (`by-code`) that keeps the URL well-formed.
 */
export function joinRoom(code: string, token: string): Promise<ApiResult<{ room: RoomDetail }>> {
  return authPost<{ room: RoomDetail }>('/rooms/by-code/join', { code }, token);
}

/** POST /api/rooms/:id/leave — vacate the caller's seat. */
export function leaveRoom(
  roomId: string,
  token: string,
): Promise<ApiResult<Record<string, never>>> {
  return authPost<Record<string, never>>(`/rooms/${encodeURIComponent(roomId)}/leave`, {}, token);
}

/** POST /api/rooms/:id/ready — toggle the caller's `is_ready`. */
export function setReady(
  roomId: string,
  ready: boolean,
  token: string,
): Promise<ApiResult<Record<string, never>>> {
  return authPost<Record<string, never>>(
    `/rooms/${encodeURIComponent(roomId)}/ready`,
    { ready },
    token,
  );
}

/** POST /api/rooms/:id/ai-seat — host-only; add an AI seat with an archetype. */
export function addAiSeat(
  roomId: string,
  archId: string,
  token: string,
): Promise<ApiResult<Record<string, never>>> {
  return authPost<Record<string, never>>(
    `/rooms/${encodeURIComponent(roomId)}/ai-seat`,
    { archId },
    token,
  );
}

/**
 * POST /api/rooms/:id/launch — host-only; transition lobby → active and
 * hydrate the in-memory Room from the newly-created games row.
 */
export function launchRoom(
  roomId: string,
  token: string,
): Promise<ApiResult<{ roomId: string; gameId?: string; hydrated: boolean }>> {
  return authPost<{ roomId: string; gameId?: string; hydrated: boolean }>(
    `/rooms/${encodeURIComponent(roomId)}/launch`,
    {},
    token,
  );
}

/**
 * GET /api/rooms/:id — latest room + optional game snapshot. Public read — no
 * token required — but we accept an optional token for forward compatibility
 * if the server tightens access later.
 */
export function getRoom(
  roomId: string,
  token?: string,
): Promise<ApiResult<{ room: RoomDetail; game: GameSummary | null }>> {
  const path = `/rooms/${encodeURIComponent(roomId)}`;
  return token !== undefined
    ? authGet<{ room: RoomDetail; game: GameSummary | null }>(path, token)
    : get<{ room: RoomDetail; game: GameSummary | null }>(path);
}
