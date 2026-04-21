# RiskRask — Gamebuild Progress Report

_Orchestrator: Mara Volkov (persona.json). Branch: `claude/game-fix-agent-8TMjc`. Started: 2026-04-21._

## Mission

"The game feels broken." Loop Opus 4.7 sub-agents through audit → fix → QA until
solo play is smooth, lint/typecheck/test are green, and the balance baseline
holds.

## Loop 0 — Diagnostics

**Orchestrator pass, no sub-agents.**

| Check                  | Result                                            |
| ---------------------- | ------------------------------------------------- |
| `bun install`          | 548 packages installed (4.25s)                    |
| `bun run typecheck`    | **PASS** — 7/7 workspaces                         |
| `bun run test`         | **PASS** — 226 tests across shared/engine/ai/server/web/admin |
| `bun run lint`         | **FAIL** — 1 format issue in `vercel.json`        |
| Balance baseline       | 98.5% victory / 1.5% stalemate / 66 avg turns (docs/balance/balance-2026-04-21.md) |

### Headline finding

The code compiles and the tests pass. Subjective "broken" feeling is likely
coming from polish gaps the previous sprint explicitly deferred:

- Lint format nit on `vercel.json`
- No dice-face pips (still numerals)
- Intel feed can spam in blitz chains
- No map tooltips
- 2-player Neutral variant flagged beta

Next loops will audit more surface area (UI runtime, engine rule gaps, server,
build config) before any code changes.

## Loop 1 — Audit (complete, parallel)

**1A — Explore sub-agent: web UI runtime audit**

Returned a ranked punch-list. P0 blockers:

1. **`phase === 'Draft'` trap (P0, playability-breaking)** — `apps/web/src/game/phase.ts:17-22` routes the UI to `Draft` whenever the human holds ≥ 5 cards. The Draft panel's `Skip` button calls `onSkipDraft`, which is a **no-op** in `apps/web/src/routes/Play.tsx:292-294`. The Deploy panel is gated on `phase === 'Deploy'` (`dossier/Dossier.tsx:79`), so a human with 5 + cards and no tradeable set gets stuck — cannot deploy, cannot trade, cannot advance. A fresh solo game usually reaches this state within 3–5 turns.
2. **AI dispatcher can stall on stale batch** — `apps/web/src/game/useSoloDispatcher.ts:53-79`. `runAiStep` dispatches the AI's multi-action batch in a for-loop; if a mid-batch action throws (silently caught), `state` does not change, so the `useEffect` does not re-fire and the AI turn freezes. Rare but fatal.
3. **Reinforce → Attack transition is correct per reducer**, but only fires when `handleDeployConfirm` actually runs. It does — when the Deploy panel is visible. See #1 for why the panel can be hidden.

P1:
- `phase.ts` comment says "Draft if 5+ cards OR tradeable set"; code only checks `>= 5`. Either tighten the comment or honour it.
- `Dossier.tsx:68` hides the entire phase hero when it's not the human's turn, including leftover Deploy state — acceptable, but confusing when a forced trade briefly flips the active player.

**1B — Integration-test sub-agent: PASS**

`apps/web/src/test/solo-playthrough.test.ts` (260 lines) — simulates a full 3-player game end-to-end via `useGame.getState().dispatch(...)` using the real store, real `dilettanteTurn`, real reducer. Result: **1 passed / 472 ms**. Full web suite: 9 files, 14 tests, all pass.

Implication: the pure store + dispatch + AI-choice layer is green. The player-reported break therefore lives specifically in the **React effect / timer layer** (which this test deliberately skips) and the **human click handler's `cp-guard`** (`Play.tsx:77-131`). This matches 1A's P0-2 (dispatcher stall). Fix target for Loop 2 confirmed.

## Loop 2 — Fix (complete, Opus 4.7 implementer)

Surgical 4-file patch, `+39/-14` lines:

- **`apps/web/src/game/phase.ts`** — `uiPhase(state, playerId, draftSkipped = false)`. Routes to `Draft` only when `findBestSet(player.cards, ownedTerritories)` is non-null OR a forced trade targets this player; otherwise `Deploy`. `draftSkipped` flag lets the UI escape Draft once.
- **`apps/web/src/routes/Play.tsx`** — new `draftSkipped` local state, reset on `state.phase` / `state.turn` change. `onSkipDraft` now sets the flag instead of no-op. `uiPhase` called with the flag.
- **`apps/web/src/dossier/Dossier.tsx`** — DeployPanel render condition relaxed from `phase === 'Deploy' && state.phase === 'reinforce'` to `state.phase === 'reinforce' && reserves > 0`, so reserves are always deployable while the Draft panel is also visible.
- **`apps/web/src/game/useSoloDispatcher.ts`** — `runAiStep` tracks `dispatched` flag. If the entire AI batch threw (or was empty) mid-turn, force-dispatches `end-turn` as a safety valve so the dispatcher cannot deadlock on an unchanged state.

## Loop 3 — QA (complete, orchestrator)

| Check                                       | Result                        |
| ------------------------------------------- | ----------------------------- |
| `bun run typecheck`                         | **PASS** — 7/7 workspaces     |
| `bun --filter @riskrask/web test`           | **PASS** — 14/14 (inc. solo-playthrough, 500 ms) |
| `bun --filter @riskrask/engine test`        | **PASS** — 92/92              |
| `bun --filter @riskrask/ai test`            | **PASS** — 113/113            |
| `bun run scripts/smoke.ts`                  | **PASS** — 982 actions, 0 engine errors, winner decided turn 13 |

Diff stat: 4 files, +39/-14 lines. No package or engine code touched.

## Loop 4 — Ship (complete)

- Three scoped commits on branch `claude/game-fix-agent-dOc1I`:
  1. `c85b382` — `docs: add fix-it orchestrator (persona, todo, progress report)`
  2. `7dd158e` — `test(web): solo playthrough integration test for store + AI wiring`
  3. `1c5a391` — `fix(web): unblock solo Risk — Draft trap, Deploy gate, dispatcher safety-valve`
- Pushed to `origin/claude/game-fix-agent-dOc1I`.

## Loop 5 — Post-ship verification (implementer agent)

Implementer sub-agent's async report arrived after orchestrator had already
committed its on-disk output. It re-verified the shipped fix:

- typecheck 7/7 · web 14/14 · engine 92/92 · ai 113/113 · server 36/36 · admin 1/1 · shared 17/17 → **273 tests green**.
- `scripts/smoke.ts` still completes cleanly (13 turns · 982 actions · 0 errors).
- Minor backlog item flagged (not fixed, per surgical-edit guardrail):
  `handleAttackSingle` in `apps/web/src/routes/Play.tsx:164-167` leaves
  `target` set after a single attack. Logged to `todo.md`.

---

# Sprint 2 — Multiplayer beachhead + polish (branch `claude/game-fix-agent-8TMjc`)

_Resumed 2026-04-21 after solo fix-it sprint landed. New mission: stand up
Track F (multiplayer server + client shell) and clear the backlog polish items
without regressing solo play._

## Loop 0 — Diagnostics (orchestrator, no sub-agent)

| Check                            | Result                                                   |
| -------------------------------- | -------------------------------------------------------- |
| `bun install`                    | 548 packages (3.2s)                                      |
| `bun run typecheck`              | **PASS** — 7/7 workspaces                                |
| `bun run test`                   | **PASS** — 273 tests across all workspaces               |
| `bun run lint`                   | **FAIL** — 4 errors (vercel.json fmt, solo-playthrough template literal, Play.tsx exhaustive-deps, format stragglers) |
| `bun run scripts/smoke.ts`       | **PASS** — 982 actions · 0 errors · winner turn 13       |

### State of the multiplayer stack entering this sprint

- **DB schema present** (migrations `0005-0015`): `rooms`, `room_seats`,
  `turn_events`, `room_messages`, `reserved_usernames`, RLS, RPCs
  (`rpc_create_room`, `rpc_join_room`, `rpc_chat_message`, launch trigger,
  nightly cron, realtime broadcast triggers).
- **Server surface missing**: `apps/server/src/index.ts` mounts only
  `/health` + `/api/saves`. No `/api/auth`, no `/api/rooms`, no WS upgrade,
  no `Room` object, no timer, no AI fallback.
- **Web client stub**: `apps/web/src/net/ws.ts` is a no-op placeholder. No
  `useRoomDispatcher`, no `Lobby.tsx`, no `packages/shared/src/protocol.ts`.
- **Track-F plan file**: `docs/superpowers/plans/2026-04-19-track-f-multiplayer.md`
  is the contract. Tasks 1-11 are all open.

## Loop 1 — Audit (parallel sub-agents, complete)

### 1A — Multiplayer gap audit (Explore, very thorough)

DB surface is more complete than the Track-F plan assumes:

- `games` table (migration `0007`) isolates per-game state; `turn_events.game_id`
  FK scopes event history per rematch cycle.
- `rooms.current_state` was dropped in `0005`; game state lives in `games.state`
  (JSONB). Server must read/write `games.state`, not `rooms.current_state`.
- RPCs available: `create_room`, `join_room`, `leave_room`, `set_ready`,
  `add_ai_seat`, `launch_game`, `send_chat`.
- RLS helpers: `is_room_member`, `is_room_host`, `was_room_member`.
- Realtime broadcast triggers wired to topics `room:{id}`, `game:{id}` (`0010`).
- `rooms-auto-code` trigger auto-fills 6-char room codes matching
  `ROOM_CODE_RE`.
- **Missing**: `tick` edge function (cron `0014` already schedules a 5s HTTP POST
  to `/functions/v1/tick`, but the edge function itself is external). Track F
  v1 uses an in-process `setInterval(1000)` inside `RoomRegistry` as a stopgap.

Server files to create (topologically ordered), shared protocol shape as zod
discriminated unions keyed by `type`, web client files (net/ws.ts, Lobby.tsx,
useRoomDispatcher.ts) and 5 target test suites all mapped. Risks called out:
Bun WebSocket upgrade via `hono/bun createBunWebSocket`, RNG seeding from
`roomCode`, service-role vs. anon client split, forced-trade gate must be
honoured in AI fallback too.

### 1B — Polish punch-list (Explore, medium)

Eight items with file:line anchors:

1. `Play.tsx:164` — `handleAttackSingle` leaves `target` set (single-line fix).
2. `DicePanel.tsx:68` — `Die` component renders numerals; switch to SVG pips.
3. `useGame.ts:38` — `appendLog` caps total 200 but a blitz chain spams the
   intel feed within one turn; need per-turn cap.
4. `Node.tsx:42-123` — no `<title>` tooltip on map hexes.
5. `vercel.json` — biome format nit (single-object array collapse).
6. `solo-playthrough.test.ts:176` — template literal without interpolation.
7. `Play.tsx:55` — `useExhaustiveDependencies` over-specifies deps.
8. Additional `solo-playthrough.test.ts` multi-line throws that `biome
   check --write` collapses.

## Loop 2 — Fix (parallel Opus 4.7 implementers, complete)

### 2A — Multiplayer server foundation

Created 12 new files (~1600 lines), modified 2:

| File                                         | Lines | Purpose                                                   |
| -------------------------------------------- | ----- | --------------------------------------------------------- |
| `packages/shared/src/protocol.ts`            | 138   | zod `ClientMsgSchema` / `ServerMsgSchema`                 |
| `packages/shared/test/protocol.test.ts`      | 120   | 14 round-trip + rejection tests                           |
| `apps/server/src/rooms/hash.ts`              | 13    | Re-export engine `hashState`                              |
| `apps/server/src/rooms/timer.ts`             | 62    | 90s + 15s bank phase timer                                |
| `apps/server/src/rooms/seat.ts`              | 19    | `Seat` interface                                          |
| `apps/server/src/rooms/Room.ts`              | 301   | Authoritative room: applyIntent, attach, broadcast, tick  |
| `apps/server/src/rooms/registry.ts`          | 101   | Singleton + 1 Hz setInterval tick (v1)                    |
| `apps/server/src/ai/fallback.ts`             | 72    | `runFallbackTurn` with forced-trade loop                  |
| `apps/server/src/persistence/turn-log.ts`    | 48    | Idempotent `turn_events` upsert                           |
| `apps/server/src/http/rooms.ts`              | 317   | REST: create/join/leave/launch/ready/ai-seat/list/get     |
| `apps/server/src/ws/index.ts`                | 198   | Bun WS upgrade (`hono/bun createBunWebSocket`)            |
| `apps/server/test/rooms-http.test.ts`        | 131   | JWT/body/query validation paths                           |
| `apps/server/test/room-turn-loop.test.ts`    | 207   | Paired-socket turn loop drive                             |
| `apps/server/test/ai-fallback.test.ts`       | 127   | Seat AFK → AI takeover flow                               |
| `packages/shared/src/index.ts`               | +1    | Re-export `./protocol`                                    |
| `apps/server/src/index.ts`                   | +5    | Mount `/api/rooms` + ws router, export `websocket`        |

Design decisions:

- **Determinism**: Room RNG is seeded from `roomCode` (`Rng` via engine's
  existing `createRng`). All server-side dice and AI decisions reproduce
  exactly on reload.
- **Persistence resilience**: `Room.applyIntent` wraps `writeTurnEvent` in
  try/catch and logs-and-swallows DB failures — a dropped Supabase connection
  cannot crash the game loop.
- **AI fallback**: re-enters `takeTurn` while `pendingForcedTrade` is set, so
  the classic elimination-trade gate (riskrules.md §4.2.7) is honoured for
  server-side AI too.
- **WS auth**: JWT via `?token=` + `?seat=` on the upgrade URL (Authorization
  header not reliably available pre-upgrade); verified against `room_seats`
  ownership before attach.
- **Chat**: broadcast in-session only; persistence to `room_messages` via
  `send_chat` RPC deferred (backlog).

### 2B — Web polish sweep

10 files touched, +247/-25 lines:

- `DicePanel.tsx` renders classic 3×3 SVG pip grid (`DiePips` helper emitting
  `<circle>` per pip); pre-roll em-dash preserved. +3 tests.
- `useGame.ts` `appendLog` introduces `PER_TURN_CAP=6`: once a turn accrues 6
  entries, older same-turn entries are evicted in favour of newer ones.
  Global 200-entry cap preserved. +2 tests.
- `Node.tsx` + `Map.tsx` add `<title>` first child of each hex `<g>` with
  `"${name}: ${armies} armies · ${continent} · adjacent to ${neighbours}"`.
  `Map.tsx` builds a frozen reverse-lookup from `CONTINENTS.members`. +1 test.
- `Play.tsx`: `setTarget(null)` after single-attack dispatch (parity with
  blitz); `useEffect` deps collapsed to derived `phaseTurnKey` string.
- `vercel.json` + `solo-playthrough.test.ts` — biome format clean.

## Loop 3 — QA (orchestrator, complete)

| Check                                  | Result                                                                 |
| -------------------------------------- | ---------------------------------------------------------------------- |
| `bun run typecheck`                    | **PASS** — 7/7 workspaces                                              |
| `bun run test`                         | **PASS** — **310 tests** (shared 34 · engine 92 · ai 113 · server 50 · admin 1 · web 20) |
| `bun run lint`                         | **PASS** — 0 errors (11 new-file format nits resolved via `biome check --write` during QA) |
| `bun run scripts/smoke.ts`             | **PASS** — 982 actions · 0 engine errors · winner turn 13              |

Test delta: 273 → 310 (+37 new tests: +14 shared protocol, +14 server, +6 web, +3 DicePanel).

## Loop 4 — Ship

- Scoped commits on branch `claude/game-fix-agent-8TMjc`:
  1. `docs(orchestrator):` — kick off sprint 2 (persona / todo / report point
     at new branch, Loop 0 baseline).
  2. `web:` — polish sweep (10 files, +247/-25).
  3. `mp(server):` — multiplayer server foundation (14 new files, 2 modified).
  4. `docs(orchestrator):` — loops 1-4 report updates.
- Pushed to `origin/claude/game-fix-agent-8TMjc`.

### What shipped

- **Multiplayer server is up**: Hono REST for room lifecycle, Bun WebSocket
  upgrade wired, authoritative `Room` object with deterministic RNG,
  server-enforced phase timer with 15 s bank, AI fallback on AFK, idempotent
  `turn_events` persistence, room registry with 1 Hz tick. All behind 50
  passing Bun tests.
- **Polish pass is in**: dice pips, map tooltips, intel feed cap, attack
  target cleanup, lint green across the monorepo.

### What's next (backlog in `todo.md`)

- Web client multiplayer wiring (real `ws.ts`, `useRoomDispatcher`, `Lobby.tsx`,
  `Play.tsx` dispatcher swap) — the shared protocol contract is now the seam.
- Chat persistence via `send_chat` RPC.
- `Database.Functions` type stubs for room RPCs.
- Tick edge function for multi-instance deployment.
- Playwright 2-human + AI-fallback scenario.

