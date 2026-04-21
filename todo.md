# RiskRask Fix-It Agent — Live TODO

_Orchestrator: Mara Volkov (persona.json). Branch: `claude/game-fix-agent-dOc1I`._

Legend: `[ ]` open · `[~]` in progress · `[x]` done · `[!]` blocked

## Loop 0 — Diagnostics (orchestrator, no sub-agent)

- [x] bun install
- [x] bun run typecheck (all 7 workspaces green)
- [x] bun run test (226 tests pass, 0 fail)
- [x] bun run lint (1 format issue: vercel.json)
- [x] Read riskrules.md, balance-2026-04-21.md, TODO.md (resume point)

## Loop 1 — Audit (complete)

- [x] 1A: Explore audit of web UI runtime → P0 punch-list (Draft trap, dispatcher stall, phase.ts gap)
- [x] 1B: Integration-test sub-agent → `solo-playthrough.test.ts` PASS (break is in React effect/timer layer)
- [~] Deferred: engine rule-correctness audit (engine + AI tests are green; 200-game baseline holds)
- [~] Deferred: server audit (solo is the v1 target per TODO.md; multiplayer is Track F)
- [~] Deferred: build/config audit (vercel.json lint nit already noted; non-blocking)

## Loop 2 — Fix (complete)

- [x] `apps/web/src/game/phase.ts` — Draft only if `findBestSet(cards, owned)` non-null or forced trade
- [x] `apps/web/src/dossier/Dossier.tsx` — DeployPanel renders whenever `reinforce` + reserves > 0
- [x] `apps/web/src/routes/Play.tsx` — `draftSkipped` escape hatch + reset on phase/turn change
- [x] `apps/web/src/game/useSoloDispatcher.ts` — safety valve: force `end-turn` if entire AI batch fails

## Loop 3 — QA (complete)

- [x] typecheck — 7/7 workspaces green
- [x] web tests — 14/14 (includes solo-playthrough)
- [x] engine tests — 92/92
- [x] ai tests — 113/113
- [x] smoke.ts — 982 actions, 0 engine errors, winner decided

## Loop 4 — Ship

- [x] Progress report updated
- [~] Commit (scoped)
- [~] Push to `claude/game-fix-agent-dOc1I`

## Backlog (not in scope this sprint)

- [ ] `handleAttackSingle` in `apps/web/src/routes/Play.tsx:164-167` doesn't clear `target` after a single attack (only blitz does at :173) — minor UX nit flagged by implementer sub-agent
- [ ] Dice face visual (pips, not numerals)
- [ ] Intel feed dedupe (cap N per turn)
- [ ] Map node tooltips (armies / continent / adjacency)
- [ ] `vercel.json` formatting nit (biome)
- [ ] Multiplayer (Track F)
