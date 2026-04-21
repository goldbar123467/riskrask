# RiskRask Fix-It Agent — Live TODO

_Orchestrator: Mara Volkov (persona.json). Branch: `claude/game-fix-agent-8TMjc`._

Legend: `[ ]` open · `[~]` in progress · `[x]` done · `[!]` blocked

## Sprint 2 goal (this pass) — COMPLETE

Stand up the multiplayer server (Track F beachhead) and clear the polish
backlog. Keep solo-game regression tests green, keep the AI closeout baseline
intact (98.5% victory / 1.5% stalemate).

---

## Loop 0 — Diagnostics (orchestrator, no sub-agent)

- [x] bun install — 548 packages (3.2s)
- [x] bun run typecheck — 7/7 workspaces green
- [x] bun run test — 273 tests pass
- [x] bun run lint — 4 errors known nits
- [x] smoke.ts — 982 actions, 0 engine errors

## Loop 1 — Audit (parallel sub-agents, complete)

- [x] 1A (Explore, very thorough): Track-F multiplayer gap audit — mapped DB surface (migrations 0005-0015), server files to create, shared protocol shape, web client shape, tests, risks (Bun WS upgrade, RNG seeding, tick edge function deferral).
- [x] 1B (Explore, medium): polish punch-list — 8 items with file:line anchors.

## Loop 2 — Fix (parallel Opus 4.7 implementers, complete)

### 2A — Multiplayer server foundation

- [x] `packages/shared/src/protocol.ts` — zod `ClientMsgSchema` / `ServerMsgSchema`
- [x] `packages/shared/test/protocol.test.ts` — +14 round-trip tests
- [x] `apps/server/src/rooms/hash.ts` — re-exports engine `hashState`
- [x] `apps/server/src/rooms/timer.ts` — 90s + 15s bank wall-clock timer
- [x] `apps/server/src/rooms/seat.ts` — Seat interface
- [x] `apps/server/src/rooms/Room.ts` — authoritative room: applyIntent, attach/detach, broadcast, tick, seeded Rng
- [x] `apps/server/src/rooms/registry.ts` — RoomRegistry singleton with 1 Hz tick
- [x] `apps/server/src/ai/fallback.ts` — runFallbackTurn with forced-trade loop
- [x] `apps/server/src/persistence/turn-log.ts` — idempotent turn_events upsert
- [x] `apps/server/src/http/rooms.ts` — REST: create / join / launch / ready / ai-seat / leave / list / get
- [x] `apps/server/src/ws/index.ts` — Bun WebSocket via `hono/bun` createBunWebSocket
- [x] `apps/server/src/index.ts` — mount `/api/rooms` + ws router, export websocket handler
- [x] Tests: `rooms-http.test.ts`, `room-turn-loop.test.ts`, `ai-fallback.test.ts` (+14 server tests)

### 2B — Web polish sweep

- [x] `Play.tsx:164` — clear `target` after `handleAttackSingle`
- [x] `DicePanel.tsx` — inline SVG pip grid (`DiePips` helper), +3 tests
- [x] `useGame.ts` — `PER_TURN_CAP=6` to cap blitz-chain spam, +2 tests
- [x] `Node.tsx` + `Map.tsx` — `<title>` tooltip with name / armies / continent / neighbours, +1 test
- [x] `vercel.json` — biome format
- [x] `solo-playthrough.test.ts:176` — template-literal nit + biome --write collapse
- [x] `Play.tsx:55` — derived `phaseTurnKey` satisfies useExhaustiveDependencies
- [x] Server + shared new-file format (biome check --write auto-fix during QA)

## Loop 3 — QA (orchestrator, complete)

- [x] `bun run typecheck` — 7/7 workspaces green
- [x] `bun run test` — **310 tests pass** (shared 34 · engine 92 · ai 113 · server 50 · admin 1 · web 20)
- [x] `bun run lint` — **0 errors**
- [x] `bun run scripts/smoke.ts` — 982 actions · 0 engine errors · winner turn 13

## Loop 4 — Ship

- [x] Update `gamebuild-progressreport.md`
- [x] Update `todo.md`
- [x] Scoped commits (polish + server + docs)
- [x] Push to `claude/game-fix-agent-8TMjc`

---

---

## Sprint 3 goal — COMPLETE

Stand up the web multiplayer client + server polish on top of the sprint-2
beachhead. Front-loaded research → per-agent build guides → parallel
sub-agents in isolated worktrees → QA gate between each merge.

### Loop 0 — Diagnostics
- [x] bun install / typecheck / 310 tests / lint clean / smoke clean

### Loop 1 — Research & build guides
- [x] `docs/mp-buildout/00-overview.md` — orchestration rules + gate pipeline
- [x] `docs/mp-buildout/A-ws-client.md`
- [x] `docs/mp-buildout/B-lobby-routing.md`
- [x] `docs/mp-buildout/C-server-polish.md`
- [x] `docs/mp-buildout/D-integration-test.md`

### Loop 2 — Gate A+C (parallel worktrees)
- [x] Agent A — `net/ws.ts` real reconnecting client + `useRoomDispatcher` + `applyEffects` on `useGame` + tests
- [x] Agent C — `send_chat` RPC persistence + `?lastSeq=` welcome delta + `Database.Functions` typed
- [x] **QA Gate 1** — 332 tests, typecheck/lint/smoke green

### Loop 3 — Gate B
- [x] Agent B (timed-out mid-stream, recovered from worktree) — `Lobby.tsx` + `auth.ts` + REST helpers + `PlayRoom.tsx` + Play switcher + victory-modal room mode + Lobby component tests
- [x] **QA Gate 2** — 337 tests, typecheck/lint/smoke green

### Loop 4 — Gate D
- [x] Agent D — server-side 2-human integration test with real WS + AI fallback in < 3 s; Playwright `.fixme()` stub; clock injection through Timer → Room → Registry
- [x] **QA Gate 3** — **338 tests** (shared 34 · engine 92 · ai 113 · server 58 · web 40 · admin 1), typecheck/lint/smoke green

### Loop 5 — Ship
- [x] Update `gamebuild-progressreport.md`
- [x] Update `todo.md`
- [x] Scoped commits on `claude/multiplayer-subagent-build-dGa5z`
- [x] Push to origin

---

## Deferred — backlog for next sprint

### Still open
- [ ] Supabase test-JWT helper → unblocks `e2e/mp-two-humans.spec.ts` Playwright scenario (currently `.fixme()`)
- [ ] Tick edge function — current 1 Hz in-process `setInterval` in `registry.ts:20` is v1; swap to `pg_cron` + edge tick when multi-instance deployment is on the table
- [ ] Auth signup route with Turnstile + username reserve (Track F Task 1 — paste-a-JWT lobby is the current stopgap)

### Other
- [ ] Admin panel (Track G)
- [ ] Replay + analytics (Track H)
- [ ] 500-game balance rerun for tighter archetype CIs
