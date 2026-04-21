# RiskRask Fix-It Agent — Live TODO

_Orchestrator: Mara Volkov (persona.json). Branch: `claude/game-fix-agent-8TMjc`._

Legend: `[ ]` open · `[~]` in progress · `[x]` done · `[!]` blocked

## Sprint goal (this pass)

Stand up the multiplayer server (Track F beachhead) and clear the polish
backlog. Keep solo-game regression tests green, keep the AI closeout baseline
intact (98.5% victory / 1.5% stalemate).

---

## Loop 0 — Diagnostics (orchestrator, no sub-agent)

- [x] bun install — 548 packages (3.2s)
- [x] bun run typecheck — 7/7 workspaces green
- [x] bun run test — 273 tests pass, 0 fail (engine 92 · ai 113 · server 36 · shared 17 · web 14 · admin 1)
- [x] bun run lint — 4 errors (`vercel.json` format, `solo-playthrough.test.ts:176` template literal, `Play.tsx:55` exhaustive deps, format stragglers)
- [x] smoke.ts — 982 actions, 0 engine errors, winner turn 13
- [x] Re-read riskrules.md · master plan · Track-F plan · current todo.md + progress report

## Loop 1 — Audit (parallel sub-agents, in flight)

- [~] 1A (Explore, very thorough): Track-F multiplayer gap audit — server has only `/health` + `/api/saves`; web `net/ws.ts` is a stub; no `packages/shared/src/protocol.ts`; Supabase migrations 0005-0015 already ship rooms / seats / turn_events / chat schema with RLS + RPCs. Need: protocol schemas, rooms REST, WS upgrade, Room object, timer, AI fallback, lobby UI, reconnect.
- [~] 1B (Explore, medium): Polish backlog punch-list — dice pips (`apps/web/src/**/Dice*`), intel feed dedupe cap, map-node tooltips, `handleAttackSingle` target cleanup (`Play.tsx:164`), lint format errors.

## Loop 2 — Fix (parallel Opus 4.7 implementers, queued)

- [ ] 2A: Multiplayer server foundation — `packages/shared/src/protocol.ts`, `apps/server/src/http/rooms.ts`, `apps/server/src/ws/index.ts`, `apps/server/src/rooms/Room.ts`, `apps/server/src/rooms/registry.ts`, `apps/server/src/rooms/timer.ts`, `apps/server/src/ai/fallback.ts`, plus Bun `test` coverage for room lifecycle + paired-socket turn + AI fallback.
- [ ] 2B: Web multiplayer client + polish — `apps/web/src/net/ws.ts` real client (reconnect backoff), `apps/web/src/game/useRoomDispatcher.ts`, `apps/web/src/routes/Lobby.tsx`, polish: dice pip faces, intel feed dedupe/cap, map-node tooltips, `handleAttackSingle` target cleanup, lint fixes.

## Loop 3 — QA (orchestrator)

- [ ] bun run typecheck — 7/7 workspaces green
- [ ] bun run test — all pass (new multiplayer + polish tests)
- [ ] bun run lint — 0 errors
- [ ] bun run scripts/smoke.ts — still green
- [ ] Manual diff review

## Loop 4 — Ship

- [ ] Update `gamebuild-progressreport.md` with loop outcomes
- [ ] Update `todo.md` (move done items, note new backlog)
- [ ] Scoped commits
- [ ] Push to `claude/game-fix-agent-8TMjc`

## Backlog (not in scope this sprint)

- [ ] Playwright `mp-two-humans.spec.ts` (needs real browsers; defer until local dev server works end-to-end)
- [ ] Admin panel (Track G)
- [ ] Replay + analytics (Track H)
- [ ] 500-game balance rerun for tighter archetype CIs
- [ ] `Play.tsx:55` `useEffect` exhaustive-deps tweak if not resolved in Loop 2
