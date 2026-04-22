# S3 — Launch, turn-based play, end-of-game

_Author: Claude Opus 4.7 · Date: 2026-04-22 · Scope: S3_

Consolidates findings from three parallel reconnaissance agents (engine map,
turn-orchestration plan, end-of-game plan, functional-readiness audit). One
unified spec because the deploy story is coupled — server rebuild + web
rebuild + two migrations go together.

---

## Goal

Make launch → play → end-of-game work end-to-end on production infra:

1. When the host presses LAUNCH, any empty seats are auto-filled with AI
   (random pick from the 9 canonical archetypes).
2. The Bun/Hono server becomes the authoritative turn driver. Each player
   (human or AI) gets **30 seconds per turn**, covering all three Risk
   phases (reinforce → attack → fortify). On expiry the server synthesises
   whatever phase-end actions remain and hands the turn to the next player.
   Humans may End Turn early.
3. When the engine sets `state.winner`, the server broadcasts `game_over`,
   persists the terminal state, and closes sockets. Clients show the
   existing `VictoryModal` for 3 seconds then `navigate('/lobby')`.

## Non-goals

- Deploying the `launch-game` / `tick` Supabase edge functions, Vault
  secrets, migration 0014's pg_cron. Scout 3 confirmed the Bun process is
  already running `registry.tickAll` internally at 1 Hz — the tick edge
  function is redundant. The launch trigger edge function is
  superseded by server-direct game creation.
- Persisting the turn deadline across server restarts. Docker restart =
  active games lost. Documented, accepted for this cycle.
- Replay / post-game stats / rematch UI. `games` rows preserved for future
  work but nothing consumes them yet.
- The `rooms.state` intermediate values `'post_game' | 'countdown' |
  'archived'` — unused. Terminal state is `'finished'`.
- Building a new `GameOverOverlay` component. `VictoryModal` already works
  (Scout 3 verified) — we only add auto-redirect on top of it.
- Changing the engine. All win detection and phase transitions already
  work (92 reducer tests + 113 AI tests pass per Scout 3).

## Critical findings from recon

| Subsystem | Status | Notes |
|---|---|---|
| `packages/engine/src/reducer.ts` | ✓ works | 92 tests; all phase transitions + `game-over` effect live |
| `packages/ai/src/orchestrator.ts::takeTurn` | ✓ works | 113 tests; full turn end-to-end |
| `apps/server/src/ai/fallback.ts` | ⚠ partial | Fires only when seat is AI-controlled; humans are NOT auto-advanced |
| `apps/server/src/rooms/Room.ts::applyIntent` | ✓ works | Hash/seq/broadcast all wired |
| `apps/server/src/rooms/timer.ts` | ✓ works | Wall-clock; default 90 s hardcoded |
| `apps/server/src/rooms/registry.ts` | ✓ works | 1 Hz `tickAll` auto-started in constructor |
| `apps/server/src/ws/index.ts` | ✓ works | Mounted in `index.ts:37`; `welcome`/`applied`/`ai-takeover`/`presence`/`chat` frames all produced |
| `apps/web/src/game/useRoomDispatcher.ts` | ✓ works | Consumes frames, re-applies reducer, reconciles hash |
| `VictoryModal.tsx` | ✓ works | Renders winner + confetti + buttons. `onRematch` is no-op in room mode (by design) |
| Migration 0011 `launch_game` RPC | ⚠ partial | Flips `rooms.state='active'` only; **does not insert the games row** |
| Migration 0011 `add_ai_seat` RPC | ✗ stale | Hardcodes 4 archetypes `default/zhukov/sun/bonaparte`; doesn't match the 9 in `packages/ai/src/arch.ts`. Lobby AI-seat picker is almost certainly broken today. |
| Migration 0013 `invoke_launch_game` trigger | ✗ dead | pg_net → edge function that was never deployed |

## Approach

### Decision 1 — Launch path: server-direct

The `POST /api/rooms/:id/launch` handler creates the `games` row
itself using `createInitialState` from `@riskrask/engine` and the service
Supabase client. Trigger-to-edge-function path is abandoned for this
cycle. Rationale:
- Bun server is always up, already holds in-memory authoritative state,
  already runs 1 Hz tick loop → external heartbeat is redundant.
- Eliminates Vault secret setup + edge function deploy + pg_cron wiring.
- Existing hydration branch in `rooms.ts:202` already tolerates the
  trigger being a no-op ("Don't hard-fail"). We keep that defensive path
  but stop depending on the trigger firing.

### Decision 2 — Timer: 30 s per TURN

One countdown per turn spanning reinforce → attack → fortify. User's
literal spec: "30 seconds to do the 3 phases." The existing `Timer`
class works; we just stop resetting it on every action (today:
`Room.ts:257` restarts on every `applyIntent`) and restart only when
`currentPlayerIdx` changes. Duration pulled from
`rooms.settings.phase_timer_sec` (already in the schema per migration
0016's `create_room`) with a **new default of 30** for fresh rooms.

### Decision 3 — Autofill: server-side in `POST /launch`

Before calling `launch_game` RPC, the handler enumerates occupied seats
via service-client read, computes gaps against `max_players`, and calls
`add_ai_seat` RPC for each gap with a random pick from `ARCH_IDS` (TS
source of truth in `packages/ai/src/arch.ts`). Sequential, not parallel,
to keep the seat-index assignment deterministic. If any call fails,
abort before launch and return `AUTOFILL_FAILED` — idempotent retry is
safe because already-filled seats are skipped.

### Decision 4 — Human force-advance

TurnDriver's timer-expiry callback checks whether the current seat is AI.
AI → fire `runFallbackTurn` (existing code). Human → synthesize whichever
of `end-attack-phase` / `end-turn` are needed to advance through the
remaining phases, applied via `room.applyAsCurrent` so hash/seq/broadcast
stay consistent. This is net-new behaviour. Net: on timer expiry
regardless of seat type, the turn ends.

### Decision 5 — Broadcasts: new `turn_advance` + `game_over` frames

Pushed over the existing WS. Clients do not poll. Frames are additive —
existing clients ignore unknown fields under zod `passthrough`.

### Decision 6 — End-of-game: reuse VictoryModal + 3 s auto-redirect

Server emits `game_over`, then calls `end_game` RPC, waits 500 ms for
frame flush, calls `room.shutdown()` (close sockets 1000 + clear send
list), `registry.delete(roomId)`. Client's existing `VictoryModal`
renders for 3 s (already mounted via `state.phase === 'done' &&
state.winner`) then `navigate('/lobby', {replace:true})`. Reconnect
fallback: if `GET /api/rooms/:id` returns `state:'finished'`, redirect
immediately with a brief toast (no 3 s wait — the event is stale).

### Decision 7 — In-memory only

Timer deadline lives in the `TurnDriver`. Server crash = active games
lost, clients see socket close → reconnect → `GET /api/rooms/:id` returns
`state='active'` but no in-memory room → they'll see a "room
unavailable" error. Acceptable for MVP; persistence is a follow-up.

## Data model changes

- **Migration 0018** — `add_ai_seat` RPC: widen archetype whitelist to
  the 9 canonical IDs (`dilettante, napoleon, fortress, jackal,
  vengeful, patient, shogun, hermit, prophet`). Keep `'default'` as a
  silent alias for `'dilettante'` so any historical rows still load.
  `NOTIFY pgrst`.
- **Migration 0019** — add `public.end_game(p_room_id uuid,
  p_winner_user_id uuid)` SECURITY DEFINER RPC. Revoke from public;
  grant execute to `service_role` only. Atomically updates `rooms`
  (`state='finished'`, `winner_id`, `finished_at=now()`) and the `games`
  row pointed at by `rooms.current_game_id` (`status='ended'`,
  `winner_user_id`, `ended_at=now()`). Idempotent (no-op if
  `state='finished'` already).
- **No schema changes** — all required columns already exist (`rooms.{
  winner_id, finished_at }`, `games.{ winner_user_id, ended_at, status
  }`).
- **`create_room` default tweak** — in the same migration (0018 or
  bundled), change `phase_timer_sec` default from 90 to 30 in the jsonb
  literal. Historical rooms unaffected.

## Server changes

### New files
- `apps/server/src/rooms/turnDriver.ts` — class owning a per-room
  `setTimeout` keyed by roomId. Methods: `start(roomId, deadlineMs)`,
  `cancel(roomId)`, `onExpire(roomId, room)`. Constructor takes `now`,
  `setTimeout`, `clearTimeout` injected for tests. `onExpire` routes to
  AI path (fallback) or human force-advance path (synthesises
  end-of-phase actions).
- `apps/server/src/rooms/autofill.ts` — `fillEmptySeats(svc, roomId,
  hostJwt, maxPlayers)`. Reads `room_seats`, computes gaps, loops
  `rpc('add_ai_seat', ...)` with random `ARCH_IDS` picks.
- `apps/server/src/rooms/createGame.ts` — `insertGameRow(svc, roomId,
  seats, seed?) → { gameId, state }`. Builds `PlayerConfig[]` from seat
  rows, calls `createInitialState`, inserts the `games` row via service
  client, updates `rooms.current_game_id`.
- `apps/server/src/rooms/endGame.ts` — `handleGameOver(roomId,
  winnerPlayerId, finalState)`. Derives winner seat/user/display,
  broadcasts `game_over`, calls `end_game` RPC, sleeps 500 ms,
  `room.shutdown()`, `registry.delete()`.

### Edits
- `apps/server/src/http/rooms.ts` `POST /:id/launch` (lines 178–245):
  1. `fillEmptySeats(...)` (new)
  2. `launch_game` RPC (existing, flips state)
  3. `insertGameRow(...)` (new — replaces the trigger-dependent wait)
  4. Re-read seats, `registry.create(...)` (existing)
  5. `turnDriver.start(roomId, now + 30_000)` (new)
- `apps/server/src/rooms/Room.ts`:
  - Remove `this.timer.start()` from inside `applyIntent` (line 257).
    Timer restarts only on `currentPlayerIdx` change.
  - Add `onGameOver?: (winnerPlayerId, finalState) => void` constructor
    option and a `private terminated` flag. Fire at end of `applyIntent`
    when `!prevWinner && state.winner`, guarded by `terminated`.
  - Add `shutdown(reason)` method: close all attached sockets (1000),
    stop timer, clear send list, set `terminated=true`.
  - Expand `attach({ send, close })` — WS handler passes a close
    callback.
  - On successful `applyIntent` that changes `currentPlayerIdx`:
    broadcast `turn_advance` frame AND if new seat is AI, microtask-queue
    `runFallbackTurn(room, newSeatIdx)` (new behaviour — today fallback
    only fires on AFK).
- `apps/server/src/rooms/registry.ts`: gain `turnDriver` singleton and
  `onGameOver` option forwarded to every `Room` at `create()`.
- `apps/server/src/ws/index.ts`: pass `close` callback to `room.attach`.
  Include `turnDeadlineMs` in the `welcome` frame.
- `apps/server/src/http/rooms.ts` `GET /:id`: include `winner_id,
  finished_at, state` in the select so the reconnect fallback can detect
  finished rooms.

## Client changes

- `packages/shared/src/protocol.ts`: add `ServerTurnAdvanceSchema` and
  `ServerGameOverSchema` to the discriminated union. `welcome` gains
  optional `turnDeadlineMs`.
- `apps/web/src/game/useRoomDispatcher.ts`: handle `turn_advance`
  (update local `turnDeadline` ref/state) and `game_over` (call a new
  `onGameOver` callback on props).
- `apps/web/src/routes/PlayRoom.tsx`:
  - New `useTurnClock(deadlineMs)` that rerenders every 250 ms with
    remaining seconds. Replaces the `clock="—"` placeholder near line
    340.
  - On `game_over`: set local state; the existing `VictoryModal` at
    line 410 already renders because `state.phase === 'done' &&
    state.winner` will be true. Add `useEffect` that schedules
    `setTimeout(() => navigate('/lobby', {replace:true}), 3000)` when
    `game_over` arrives.
  - Reconnect fallback: in the initial `getRoom(roomId, token)` resolver
    (near line 65), if `res.data.room.state === 'finished'`, redirect
    immediately to `/lobby` with a toast.
- `apps/web/src/components/VictoryModal.tsx`: no changes. (`onRematch`
  stays a no-op in room mode; the auto-redirect handles the "done" flow.)

## Engine changes

None. Every piece we depend on already exists: `createInitialState`,
`apply`, `end-attack-phase`, `end-turn`, `checkVictory`, `state.winner`,
`state.phase='done'`, `{kind:'game-over', winner}` effect.

## WS protocol changes

New server→client frames:
```
{ type: 'turn_advance', currentSeatIdx: number, turnNumber: int,
  deadlineMs: number }

{ type: 'game_over', winnerPlayerId: string, winnerSeatIdx: int | null,
  winnerUserId: string | null, winnerDisplay: string,
  finalHash: string, finalSeq: int }
```
`welcome` gains optional `turnDeadlineMs?: number`. No client→server
changes.

## Migration list

- `0018_widen_ai_archetypes_and_default_timer.sql` — widen
  `add_ai_seat` RPC whitelist to 9 canonical IDs; alias `'default'`→
  `'dilettante'`; change `create_room` `phase_timer_sec` default to 30.
- `0019_end_game_rpc.sql` — new `end_game(uuid, uuid)` RPC,
  service_role only.

## Tests

- `apps/server/test/autofill.test.ts` — N gaps → N `add_ai_seat` calls
  with valid archetype IDs; occupied seats skipped.
- `apps/server/test/createGame.test.ts` — seat-row-to-PlayerConfig
  mapping; games row inserted with expected state snapshot.
- `apps/server/test/turnDriver.test.ts` — fake clock; expire after 30 s;
  AI → `runFallbackTurn` fires; human → synthetic end-phase actions
  applied; cancelled on game_over.
- `apps/server/test/launch.integration.test.ts` — POST /launch with 1
  human + 5 empty seats → 6 total seats + hydrated Room at
  `phase='setup-claim'`.
- `apps/server/test/room.turnAdvance.test.ts` — applyIntent that changes
  `currentPlayerIdx` emits `turn_advance` with fresh deadline.
- `apps/server/test/end-of-game.test.ts` — drive mock state to victory;
  assert `game_over` broadcast, `onGameOver` fires once, `registry.get`
  undefined after, mock sockets observed `close(1000)`.
- `apps/web/src/routes/PlayRoom.test.tsx` — mock dispatcher emits
  `game_over` → VictoryModal visible → `navigate('/lobby')` after 3 s
  (fake timers). Reconnect: `getRoom` returns `state='finished'` →
  immediate redirect.
- `packages/shared/test/protocol.test.ts` — new frames parse.
- **Archetype drift guard** — dev-only test that parses
  migration 0018 and asserts whitelist matches `ARCH_IDS` in TS. Stops
  future silent drift.

## Risks

1. **Autofill mid-failure.** Partial seat fill if one `add_ai_seat` RPC
   errors. Mitigated by aborting before `launch_game` and returning
   `AUTOFILL_FAILED` — host retries, idempotent for filled seats.
2. **30 s is tight for humans.** Set once, configurable via
   `rooms.settings.phase_timer_sec`. Playtest; bump if frustrating.
3. **Server crash loses active games.** Accepted for MVP. Documented
   in runbook.
4. **`add_ai_seat` archetype drift.** Lint test guards against future
   mismatch. Existing rows (if any) with `'default'` still load via
   alias.
5. **AI takeover storms.** Host launches + disconnects → 6 AI + 1 AFK
   human could chain-fire. Bounded by `MAX_FALLBACK_PASSES = 4` in
   `fallback.ts:19` and microtask-queued single AI per turn advance.
6. **Double-fire on concede vs auto-win.** `Room.terminated` flag
   prevents duplicate `onGameOver` calls.
7. **Client sends intent after `game_over`.** Engine already rejects
   `phase==='done'` — add explicit server-side `terminated` guard in
   `applyIntent` to return a descriptive error.
8. **PlayerId ↔ UserId mapping for winner.** PlayerIds are derived in
   `setup.ts` from seat `userId`; verify `endGame.ts` resolves winner
   back to `seats[i].userId` correctly. Add unit test.

## MVP implementation order

Each numbered step is a standalone shippable increment unless marked as
coupled. Steps 1–4 land with zero user-visible change; the first
user-visible flip is step 9.

1. **Migration 0018** — widen archetype whitelist, timer default 30.
   Apply to hosted Supabase.
2. **Migration 0019** — `end_game` RPC. Apply.
3. **Shared protocol** — add `turn_advance` + `game_over` + optional
   `turnDeadlineMs` on `welcome`. Tests. Rebuild shared package.
4. **`createGame.ts` helper** — pure seat→PlayerConfig + service-client
   insert. Unit-test against mocked client.
5. **`autofill.ts` helper** — fills empty seats. Unit test.
6. **Wire launch handler** — `POST /launch` calls autofill + insertGame.
   Integration test: launch → 6-seat room → state `setup-claim`.
7. **`TurnDriver`** — new file, 30 s `setTimeout`, reads
   `room.settings.phase_timer_sec` with default 30. Wired into
   `registry.create` so every launched room gets one. Unit tests with
   fake clock.
8. **Room turn_advance broadcast + AI auto-run on turn start** — emit
   `turn_advance` on every `currentPlayerIdx` change; microtask-queue
   `runFallbackTurn` if new seat is AI.
9. **Human force-advance on timer expiry** — TurnDriver.onExpire
   synthesises `end-attack-phase` + `end-turn` as needed via
   `room.applyAsCurrent`. Integration test. **This is the first
   visible change — games now actually progress.**
10. **Client clock + `turn_advance` handler** — countdown renders in
    PlayRoom. Manual QA on dev server.
11. **End-of-game hook on Room** — `onGameOver` callback, `terminated`
    flag, `shutdown()` method, `attach({send, close})`. Unit test.
12. **`endGame.ts` module** — `handleGameOver` broadcasts + RPC +
    shutdown. Integration test.
13. **Client `game_over` + 3 s auto-redirect** — reuse existing
    `VictoryModal`, add `useEffect` timer. Also add reconnect fallback
    that detects `state='finished'` on `getRoom`.
14. **Manual E2E QA on VPS** — 2-human blitz to victory, or 1-human +
    5-AI autofill → AI plays autonomously for a turn → human turn →
    timer expires → auto-advance → eventual winner → redirect.
15. **Deploy** — server rebuild, web bundle, browser smoke test.

Steps 1–3 + 11 + 12 can be done in a dedicated server worktree.
Steps 4–10 + 13 touch both server and client; single worktree.
Migrations land before any code deploy.
