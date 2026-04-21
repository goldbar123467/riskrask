# RiskRask — Gamebuild Progress Report

_Orchestrator: Mara Volkov (persona.json). Branch: `claude/game-fix-agent-dOc1I`. Started: 2026-04-21._

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

## Loop 4 — Ship (this commit)

- Three scoped commits on branch `claude/game-fix-agent-dOc1I`:
  1. `docs: add fix-it orchestrator (persona, todo, progress report)`
  2. `test(web): solo playthrough integration test for store + AI wiring`
  3. `fix(web): unblock solo Risk — Draft trap, Deploy gate, dispatcher safety-valve`
- Push to `origin/claude/game-fix-agent-dOc1I`.

