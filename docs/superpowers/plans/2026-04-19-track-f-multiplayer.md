# Track F — Auth + Rooms + Multiplayer Turn Loop Plan

> **For agentic workers:** Use superpowers:executing-plans. Ends Phase 2. TDD. Playwright covers 2-human room + AI fallback.

**Goal:** Wire server-authoritative multiplayer: Supabase Auth, room lobby + lifecycle, WebSocket turn loop, server-enforced timer, AI fallback on timeout/disconnect, chat, desync resync.

**Worktree:** `.claude/worktrees/track-f-multiplayer`. Cut after Phase 1 merges.

---

## File structure

| File | Purpose |
|---|---|
| `apps/server/src/ws/index.ts` | WebSocket upgrade + per-room registry |
| `apps/server/src/rooms/Room.ts` | In-memory room: players, engine state, timer, broadcast |
| `apps/server/src/rooms/registry.ts` | Room lookup/lifecycle |
| `apps/server/src/rooms/timer.ts` | Server-authoritative countdown + bank |
| `apps/server/src/ai/fallback.ts` | Bridge to `@riskrask/ai` `takeTurn` |
| `apps/server/src/http/rooms.ts` | REST for create/list/join rooms |
| `apps/server/src/http/auth.ts` | Signup w/ Turnstile + username reserve |
| `apps/server/src/persistence/turnlog.ts` | Writes to `turn_events` |
| `apps/web/src/net/ws.ts` | WebSocket client + reconnect/backoff |
| `apps/web/src/net/protocol.ts` | Re-export zod schemas from shared |
| `apps/web/src/game/useRoomDispatcher.ts` | Dispatcher that sends intents + waits for `applied` |
| `apps/web/src/routes/Lobby.tsx` | Room list + create + join |
| `apps/web/src/routes/Play.tsx` (extended) | Now drives either solo or room store |
| `packages/shared/src/protocol.ts` | Client↔server message schemas |
| `e2e/mp-two-humans.spec.ts` | Playwright: two browsers, one room, AI-fallback scenario |

## Tasks

### Task 1: Signup / auth routes

- [ ] `POST /api/auth/signup`: `{ username, password, email?, turnstileToken }` → Turnstile verify → create Supabase user (synthetic email if none) → insert `profiles` row.
- [ ] `POST /api/auth/login`: username → email lookup → Supabase sign-in → return JWT.
- [ ] Tests: happy path, reserved username rejected, Turnstile failure rejected, username collision rejected.

### Task 2: Shared protocol schemas

- [ ] Implement `packages/shared/src/protocol.ts` with the discriminated unions from design doc §7.2, zod-validated.

### Task 3: Room lifecycle

- [ ] `POST /api/rooms` creates a room (generates 6-char invite code via `generate-room-code`), inserts into `rooms`, seats the host.
- [ ] `POST /api/rooms/:id/join` adds to `room_seats`; errors if full.
- [ ] `GET /api/rooms?visibility=public&state=lobby` lists rooms.
- [ ] Transition `lobby → active` when host clicks start; transition `active → finished` on victory; transition `finished → archived` nightly via a Postgres cron function.

### Task 4: Room server object + WS upgrade

- [ ] `Room` class holds `state: GameState`, `seats: Seat[]`, `timer: Timer`, `socketsBySeat: Map<number, WebSocket>`.
- [ ] On `join` message: send `welcome` + current state to the joiner; broadcast presence.
- [ ] On `intent`: validate seat, apply via engine `apply`, persist `turn_events` row, broadcast `applied` with hash, check timer + phase transitions.
- [ ] Tests: drive a room via paired in-process sockets through a full turn.

### Task 5: Server-enforced timer

- [ ] 90s base + 15s rollover bank. Timer only runs when it's the seat's turn and the phase needs a decision.
- [ ] Timer exhaustion → mark seat `afk=true`, invoke AI fallback.
- [ ] On reconnect: `afk=false` from the next turn; current turn finishes under AI control.

### Task 6: AI fallback bridge

- [ ] `ai/fallback.ts`: `runFallbackTurn(room, seatIdx)`:
  - Obtain seat's personality (or default `dilettante`).
  - Call `takeTurn(state, playerId, room.rng)`.
  - Apply each returned action through the same pipeline a human uses.
  - Emit `ai-takeover` + subsequent `applied` messages.
- [ ] Tests: simulate timeout; assert the turn completes without errors and `applied` messages are broadcast in order.

### Task 7: Desync recovery

- [ ] On each `applied`, server includes `hash`. Clients send their post-apply hash on the next `intent`. Mismatch → server replies with `welcome` (full snapshot) before applying the intent (rejected with `DESYNC`).
- [ ] Tests: tamper client state; server recovers.

### Task 8: Chat

- [ ] `chat` message from client → persist `room_messages` row → broadcast. 500-char cap + rate limit (3/sec/user) enforced server-side.

### Task 9: Web lobby + room UI

- [ ] `Lobby.tsx`: list public rooms with TanStack Query, create room form, join-by-code field.
- [ ] `Play.tsx`: detects `:roomId` and uses `useRoomDispatcher` instead of the solo one. Same UI components otherwise.
- [ ] Presence: show "reconnecting…" for a seat after 5s of heartbeat miss.

### Task 10: Reconnect

- [ ] `apps/web/src/net/ws.ts`: exponential backoff, resume on `welcome`, replay any queued client intents that haven't been acked.

### Task 11: Playwright

- [ ] `e2e/mp-two-humans.spec.ts`: spin up two contexts, create room in one, join from the other, play first turn from P1, go AFK → assert AI takeover → P1 reconnects → takes turn next round.

### Task 12: Commit

```
mp: server-authoritative rooms, timer, AI fallback, desync recovery

- Auth via Supabase + Turnstile
- WebSocket protocol with zod-validated discriminated unions
- In-memory Room objects reconciled to turn_events on each apply
- 90s+15s bank timer, AI fallback on timeout/disconnect, reclaim on reconnect
- Playwright 2-human + AI-fallback smoke

Ref: docs/superpowers/specs/2026-04-19-riskrask-v3-design.md §7, §10
```
