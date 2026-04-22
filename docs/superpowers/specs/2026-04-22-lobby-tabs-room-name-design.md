# Lobby — room name + sub-tabs (My Rooms / Public Lobby)

_Author: Claude Opus 4.7 · Date: 2026-04-22 · Scope: S2_

## Goal

Close the last UX gap between "authenticated user" and "host-of-a-lobby":
give rooms an optional name, split the lobby left panel into two tabs (rooms
I'm in vs. the public board), and verify the create → seat → ready path works
end-to-end on production infra. LAUNCH-side wiring (Vault secrets, launch-game
edge fn, cron tick) is out of scope — tracked separately as S3.

## Non-goals

- Renaming an existing room (no UI, no RPC, no migration).
- Name uniqueness.
- Any LAUNCH-side wiring. `rooms.state='active'` will continue to flip without
  a corresponding `games` row until S3 lands.
- Persisting tab selection beyond the current URL (no localStorage).

## Approach

Three options were considered:

- **A.** Client-side filter on the existing public list. Broken for private
  rooms. Rejected.
- **B.** Dedicated `GET /api/rooms/mine` endpoint, backed by a new
  `list_my_rooms()` RPC. **Selected.** Clean boundary, matches REST
  "me-shaped" conventions, SECURITY DEFINER centralises the auth check.
- **C.** Query-param on the existing `GET /api/rooms`. Equivalent payload,
  fewer routes, but mixes two access patterns in one endpoint.

## Data model

New migration: `supabase/migrations/0016_rooms_name_and_my_rooms.sql`.

```sql
-- optional name; empty/whitespace → NULL, falls back to `code` in the UI
alter table rooms add column if not exists name text;
alter table rooms drop constraint if exists rooms_name_len_ck;
alter table rooms add constraint rooms_name_len_ck
  check (name is null or length(trim(name)) between 1 and 80);

-- create_room: 4th optional param p_name
create or replace function public.create_room(
  p_visibility  text  default 'public',
  p_max_players int   default 6,
  p_settings    jsonb default '{}'::jsonb,
  p_name        text  default null
) returns rooms
language plpgsql security definer set search_path = public as $$
... trims p_name, NULL if empty after trim, inserts into rooms.name ...
$$;

grant execute on function public.create_room(text, int, jsonb, text) to authenticated;

-- list_my_rooms: active-seat rooms the caller is in, any state, any visibility
create or replace function public.list_my_rooms()
returns table (
  id uuid, code text, name text, state room_state, visibility text,
  max_players int, host_id uuid, created_at timestamptz,
  seat_count int, my_seat_idx int
)
language sql security definer set search_path = public stable as $$ ... $$;
grant execute on function public.list_my_rooms() to authenticated;

-- force PostgREST schema reload so the new create_room signature is visible
notify pgrst, 'reload schema';
```

## Server

File: `apps/server/src/http/rooms.ts`.

- `CreateRoomBody` zod schema: add `name: z.string().trim().min(1).max(80).optional()`.
- `POST /` passes `p_name: body.name ?? null` to the RPC.
- Add `GET /mine` route: auth-check → `anonClient(jwt).rpc('list_my_rooms')` →
  `{ ok: true, rooms }`. The RPC returns snake_case columns; map to camelCase
  (`maxPlayers`, `hostId`, `createdAt`, `seatCount`, `mySeatIdx`) before emit.
- Extend the existing `GET /` (public list) response to include `name` so the
  Public tab can render it too.

## Client

**`apps/web/src/net/api.ts`**

- `CreateRoomBody`: add `name?: string`.
- `RoomSummary`: add `name: string | null`; optional `mySeatIdx?: number | null`.
- New function `listMyRooms(token)` →
  `authGet<{ rooms: RoomSummary[] }>('/rooms/mine', token)`.

**`apps/web/src/routes/Lobby.tsx`**

- Read/write tab via `useSearchParams()`. Default `?tab=public`. Valid values:
  `my | public`.
- `RoomListPanel` renders a `<TabBar>` row above the list. `my` calls
  `listMyRooms`; `public` keeps `listPublicRooms`. Empty state for `my`:
  _"No active rooms — create one or join by code."_
- `CreateRoomForm` adds a `name` text input above Visibility. Optional,
  `maxLength={80}`. On submit, include `name` in the body only when the
  trimmed value is non-empty.
- On create success: `navigate('/lobby/' + id + '?tab=my')`.
- List rows render `{room.name ?? room.code}` as the primary label with the
  code in dim secondary text. Same convention in `ActiveRoomPanel` header.
- Navigation between list + detail preserves the `tab` query param.

## Tests

1. **Supabase integration** — raw SQL via the Management API:
   - `create_room` with non-empty `p_name` → stores trimmed value.
   - `create_room` with `'   '` → stores NULL (whitespace-only rejected).
   - `list_my_rooms()` for an uninvolved caller returns empty; after
     `create_room` returns exactly one row with `my_seat_idx = 0`.
2. **Server route tests** — `POST /api/rooms` with/without `name`;
   `GET /api/rooms/mine` — 401 without token, 200 with.
3. **Web unit tests (vitest)** — `Lobby` dispatches `listMyRooms` when
   `?tab=my`, `listPublicRooms` otherwise. `CreateRoomForm` only submits
   `name` when non-empty. Row renders `name ?? code`.
4. **Manual E2E smoke** — browser flow: sign in → create "Test Alpha" →
   land on `/lobby/<id>?tab=my` → row shows name → seat 0 is me → Ready
   toggles cleanly.

## Deployment sequence

1. Apply `0016` via Supabase Management API (PAT already in memory).
2. Rebuild server docker image on VPS, recreate container.
3. Rebuild web bundle locally, `wrangler deploy` from workstation.
4. Browser verification.
5. Branch `feat/lobby-tabs-room-name` commits land but are not pushed until
   post-deploy verification passes.

## Risks

- Extending `create_room`'s Postgres signature requires a PostgREST schema
  reload. `NOTIFY pgrst, 'reload schema'` is included at the end of 0016.
- Deep-link refresh on `/lobby/<id>?tab=my` works — tab state is derived from
  the URL and is independent of which room is selected.
- Leaving a room sets `left_at`, so `list_my_rooms` (filtered by
  `left_at IS NULL`) correctly drops the row. No stale "my" entries.
