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

## Deferred — backlog for next sprint

### Track F follow-on (client + chat + tick)
- [ ] `apps/web/src/net/ws.ts` — replace stub with real reconnecting client + intent queue + heartbeat (contract already defined in `packages/shared/src/protocol.ts`)
- [ ] `apps/web/src/net/protocol.ts` — re-export shared schemas for client use
- [ ] `apps/web/src/game/useRoomDispatcher.ts` — parallel to `useSoloDispatcher`; sends `intent`, waits for `applied`
- [ ] `apps/web/src/routes/Lobby.tsx` — list / create / join / ready / add-AI / launch
- [ ] `apps/web/src/routes/Play.tsx` — detect `:roomId` route param, swap dispatcher
- [ ] `apps/server/src/ws/index.ts:145` — chat currently broadcasts in-session only; wire to `send_chat` RPC
- [ ] `apps/server/src/ws/index.ts:66` — `welcome` replays full state; add `lastSeq` delta replay (event log already populated in `Room.getEventLog()`)
- [ ] `apps/server/src/supabase.ts:17` — `Database.Functions` is missing `create_room` / `join_room` / `leave_room` / `set_ready` / `add_ai_seat` / `launch_game` signatures; add when we have a codegen pass
- [ ] Tick edge function — current 1 Hz in-process `setInterval` in `registry.ts:20` is v1; swap to `pg_cron` + edge tick when multi-instance deployment is on the table
- [ ] `e2e/mp-two-humans.spec.ts` — Playwright 2-human + AI-fallback scenario

### Other
- [ ] Admin panel (Track G)
- [ ] Replay + analytics (Track H)
- [ ] 500-game balance rerun for tighter archetype CIs
- [ ] Auth signup route with Turnstile + username reserve (Track F Task 1 — login currently works end-to-end)
