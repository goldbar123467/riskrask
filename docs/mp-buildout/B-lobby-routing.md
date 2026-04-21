# Agent B — Lobby Route + Play :roomId Wiring + Room REST

**Branch**: `claude/mp-agent-b-lobby-routing` (isolated worktree).
**Depends on**: Agent A's WS client + `useRoomDispatcher` merged into your starting base.

## Task

Build a playable lobby UI and hook `/play/:roomId` up to Agent A's
`useRoomDispatcher`. Add room REST helpers in `apps/web/src/net/api.ts`. No
server-side work — that's Agent C.

## Files to create or modify (5)

### 1. `apps/web/src/net/api.ts` — ADD room REST helpers (~80 new lines)

Existing `post` / `get` helpers are already there. Add a signed variant that
includes a `Bearer` token in `Authorization`:

```ts
async function authPost<T>(path: string, body: unknown, token: string): Promise<ApiResult<T>> { … }
async function authGet<T>(path: string, token: string): Promise<ApiResult<T>> { … }
```

Then export typed wrappers for every endpoint audited in Agent A's guide (see
`docs/mp-buildout/00-overview.md` for cross-ref):

```ts
listPublicRooms(token: string): Promise<ApiResult<{ rooms: RoomSummary[] }>>
createRoom(body: { visibility: 'public'|'private'; maxPlayers: number }, token: string): Promise<ApiResult<{ room: RoomDetail }>>
joinRoom(code: string, token: string): Promise<ApiResult<{ room: RoomDetail }>>
leaveRoom(roomId: string, token: string): Promise<ApiResult<{}>>
setReady(roomId: string, ready: boolean, token: string): Promise<ApiResult<{}>>
addAiSeat(roomId: string, archId: string, token: string): Promise<ApiResult<{}>>
launchRoom(roomId: string, token: string): Promise<ApiResult<{ roomId: string; gameId?: string; hydrated: boolean }>>
getRoom(roomId: string): Promise<ApiResult<{ room: RoomDetail; game: GameSummary | null }>>
```

Define `RoomSummary`, `RoomDetail`, `GameSummary` in the same file. Keep them
flat — no deep nesting. These are typed for the client; the server is the
source of truth.

### 2. `apps/web/src/routes/Lobby.tsx` — NEW, ~280 lines

Full-screen route with three panels (stack on mobile via `ResponsiveShell`):

- **Left panel — Room list**:
  - Calls `listPublicRooms` on mount, polls every 5 s via `setInterval`.
  - Shows each row: code, host, `${seatCount}/${maxPlayers}`, state badge, "Join" button.
  - "Create room" button opens a small inline form (visibility radio, maxPlayers select 2–6). Submits `createRoom`, navigates to `/lobby/${room.id}`.
  - "Join by code" input (6-char, uppercase, validated against `ROOM_CODE_RE` from `@riskrask/shared`). On submit: calls `joinRoom` with the code, navigates to `/lobby/${room.id}`.

- **Right panel — Active room** (when `:roomId` param is present):
  - Calls `getRoom(roomId)` on mount + polls every 3 s until `room.state === 'active'`.
  - Lists seats with seat index, user display name (fallback `Seat ${i}`), ready badge, AI archetype badge.
  - Host-only controls: "Add AI seat" (archetype select), "Kick" per seat (future — omit for v1), "Launch" (enabled when ≥ 2 seats and all ready). Launch calls `launchRoom`, then `navigate('/play/' + roomId)`.
  - Non-host controls: "Ready" / "Not ready" toggle calls `setReady`.
  - "Leave room" button calls `leaveRoom`, navigates back to `/lobby`.
  - Show the room code prominently so humans can copy-paste.

- **Empty state** when no roomId param: full-width room list.

Auth / JWT sourcing:

- For this sprint, add `apps/web/src/net/auth.ts` — a minimal `useAuth()` hook
  that reads a JWT from `localStorage['rr_token']` and returns
  `{ token: string | null, userId: string | null, setToken(t|null), clearToken() }`. If
  `token` is null, the Lobby shows a "Sign in to play multiplayer" message
  with a text input where the user pastes a JWT manually (stopgap until the
  signup route ships — tracked in the deferred backlog). In production this
  panel reads from the existing auth flow; for now the paste-to-test box is
  what drives the integration test.

### 3. `apps/web/src/App.tsx` — ADD routes (~3 lines changed)

```diff
  <Route path="/setup" element={<Setup />} />
+ <Route path="/lobby" element={<Lobby />} />
+ <Route path="/lobby/:roomId" element={<Lobby />} />
  <Route path="/play" element={<Play />} />
+ <Route path="/play/:roomId" element={<Play />} />
```

### 4. `apps/web/src/routes/Play.tsx` — ADD roomId branch (~30 lines changed)

Detect `:roomId`:

```ts
const { roomId } = useParams<{ roomId?: string }>();
const { token, userId } = useAuth();
```

When `roomId` is defined:
- Skip the `if (!state) navigate('/')` redirect (state hydrates from WS welcome).
- Resolve the current user's `seatIdx` by calling `getRoom(roomId)` once and finding the row with `userId === userId`. If not found → navigate to `/lobby/${roomId}` (you haven't joined yet).
- Instead of `useSoloDispatcher`, call Agent A's `useRoomDispatcher({ roomId, seatIdx, token })`.
- Disable `handleRematch` (it's solo-only — rematch for MP is a host-triggered flow via `launch_game` which creates a new `games` row). Hide the rematch button for MP sessions; the victory modal for MP shows a "Back to lobby" button instead.

When `roomId` is undefined, Play.tsx behaviour is **exactly today's solo
behaviour** — no regression.

### 5. `apps/web/src/routes/Lobby.test.tsx` — NEW, ~100 lines

Minimum coverage:

- Renders the "Create room" form and triggers `createRoom` on submit (mock `fetch`).
- Validates a 6-char uppercase code input against `ROOM_CODE_RE`; rejects lowercase/too-short.
- Polling tick advances room list (fake timers).
- Host's "Launch" button is disabled until ≥ 2 seats all-ready (fixture-driven).
- Non-host's "Ready" toggle calls `setReady`.

## Do NOT touch

- `apps/web/src/net/ws.ts` — Agent A owns this; import the `WsClient` interface, don't reimplement.
- `apps/web/src/game/useRoomDispatcher.ts` — Agent A owns this; import and call.
- `apps/server/*` — Agent C.

## Home.tsx surfaced link

Add one line to `Home.tsx` — a "Multiplayer" button next to the existing
"Start solo game" button that navigates to `/lobby`. Keep the existing solo
flow dominant; multiplayer is an additional entry.

## Acceptance

```sh
bun install
bun run typecheck
bun --filter @riskrask/web test
bun run lint
```

All green. Solo regression test `solo-playthrough.test.ts` must stay green.

Commit groups:
1. `web(net):` — api.ts room REST + auth.ts stub
2. `web(routes):` — Lobby.tsx + App.tsx + Play.tsx roomId branch
3. `web(tests):` — Lobby.test.tsx

Push to `claude/mp-agent-b-lobby-routing`.
