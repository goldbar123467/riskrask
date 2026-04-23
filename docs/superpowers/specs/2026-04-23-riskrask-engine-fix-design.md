# Riskrask — Engine, Gameplay Loop, UI Twitch, and MP Wiring Fix

**Spec authored:** 2026-04-23
**Orchestrator:** Mara Volkov (`persona.json`)
**Integration branch:** `claude/game-fix-2026-04-23`
**Rules source of truth:** `riskrules.md`

---

## 1. Problem

Users report:

1. **"Icons twitch a ton"** — visible flicker on the map during AI ticks and phase transitions.
2. **"Gameplay loop doesn't work"** — the solo and multiplayer games stall in specific phases.
3. **Engine-to-DB-to-MP wiring** is incomplete: `games.state` is never persisted after launch; the in-memory event log is not replayed on server restart.

Four parallel Explore audits produced ranked punch-lists against `riskrules.md`, the engine, the web client, the server, and migrations. This spec consolidates those findings into a scoped, shippable fix.

---

## 2. Scope

Five workstreams, parallelizable except where noted.

### A. Gameplay loop correctness (solo + MP share this code path)

Deadlocks and phase mis-renders that block the user from advancing.

- **A1 · DeployPanel stall at 0 reserves.** `apps/web/src/dossier/Dossier.tsx:85` gates DeployPanel on `state.phase === 'reinforce' && reserves > 0`. When the human drains their reserves, the panel vanishes but the engine stays in `reinforce` until the final `reinforce` action is dispatched. There is no button to transition. Fix: render DeployPanel (or a dedicated "End Reinforce" state) for the entire `reinforce` phase, and auto-advance the engine when reserves hit 0 inside `applyReinforce` — whichever is smaller and keeps the pure reducer contract intact. Prefer engine auto-advance (it already does this when the last card is drawn; extend the same pattern).
- **A2 · Mixed `state.phase` vs `uiPhase` gates in Dossier.** DeployPanel checks `state.phase`, Draft/Attack/Fortify check `uiPhase`. A `pendingForcedTrade` during `reinforce` with 0 reserves can leave all four panels hidden simultaneously. Fix: normalize on one source of truth for panel visibility (prefer `state.phase` since the engine is authoritative) and derive `uiPhase` only for the Topbar label.
- **A3 · ForcedTradeModal reachability.** The modal is sibling-rendered after the ResponsiveShell in `Play.tsx` and `PlayRoom.tsx`, so it *is* reachable, but if the shell is blank the user has no visual cue. Fix: when `state.pendingForcedTrade` is set, dim the shell and force-open the modal with a backdrop so the user sees it immediately regardless of which panel was previously visible.
- **A4 · Solo dispatcher silent-stall.** `apps/web/src/game/useSoloDispatcher.ts` runs the AI batch in a for-loop with a try/catch that swallows errors. If every action throws (possible after an out-of-sync state re-entry), the safety-valve `end-turn` is attempted; if *that* throws, the dispatcher returns with an unchanged `state`. The `useEffect` only fires on `state` changes, so the loop is dead. Fix: treat "no progress made after a full batch" as a hard failure that either surfaces a toast and escapes the turn, or tears down to a known-good state via `state.currentPlayerIdx` skip.
- **A5 · `move-after-capture` stall.** When the engine sets `pendingMove`, the solo AI always dispatches exactly one action. If it fails, A4's stall triggers. Fix: validate `pendingMove` against current board state before dispatch; if invalid, clear it with a min-count dispatch or log + skip.

### B. UI re-render (icon twitch)

Solo and MP share the render tree from `<Stage>` downward, so fixes apply to both.

- **B1 · Memoize `<Node>`.** `apps/web/src/map/Node.tsx` is not wrapped in `React.memo`. `apps/web/src/map/Map.tsx:126–142` re-renders 42 of these on every store update. Fix: `React.memo(Node, shallowCompareExceptCallbacks)` and stabilize `onSelect`/`onHover` props via `useCallback` at the `Map` level (not `Stage` level).
- **B2 · Stabilize SVG transforms.** `Node.tsx:67–68` and `UnitSilhouette.tsx:18` compute `transform` and `transformOrigin` as inline template strings on every render. Even when values are unchanged, React reconciles and the browser re-applies, restarting the `pulseGlow` keyframe. Fix: `useMemo` the transform strings per `(x, y, size)` triple; for nodes whose coordinates are constants from `board.ts`, precompute once at module load.
- **B3 · `effectsQueue` selector thrash.** `Play.tsx:75–89` and `PlayRoom.tsx` read `useGame((s) => s.effectsQueue)` and `shiftEffect()` inside a `useEffect` with `[effectsQueue, shiftEffect]` deps. Each shift mints a new array reference → re-fires the effect → cascade through Stage and Dossier. Fix: split into `useGame((s) => s.effectsQueue.length)` for the trigger and a ref for the draining logic, or use zustand's `useShallow` helper.
- **B4 · DicePanel keyframe restart.** `DicePanel.tsx:49–117` re-keys the die-tumble animation via `JSON.stringify({attackDice, defenseDice})`. Fix: key on `attackDice.length + ':' + attackDice.join(',')` (cheaper, stable) or move the shake state to CSS animation-iteration-count driven by a class toggle.

### C. Engine rule alignment

No P0 rule violations found. Close the P1/P2 gaps so future rule changes have regression coverage.

- **C1 · Validate `fortifyRule`.** `setup.ts` currently accepts any string. Add a zod enum (`'adjacent' | 'connected'`) and throw on unknown values in `createInitialState`.
- **C2 · Tests for card-per-turn cap.** Add an engine test that after a 5-capture attack phase, exactly one `card-drawn` effect fires at `end-attack-phase`.
- **C3 · Test for 6+ card cascade.** Add a test that covers §4.2.7: after elimination, attacker with ≥6 cards cannot `attack` until trades bring them below 5.
- **C4 · Test for RNG determinism.** Already implicitly covered; add an explicit golden-seed test that hashes the full turn sequence for 3-player deterministic replay.

### D. DB + MP wiring

- **D1 · Persist `games.state` on applied actions.** Today `insertGameRow` writes once at launch and `turn_events` is the only authoritative on-wire record after that. Add a `updateGameSnapshot(gameId, state, hash, seq)` helper invoked from `Room.applyIntent` after success, debounced per-room (write at most every 1 s + always on turn advance + always on game-over). Schema already has `games.state jsonb`.
- **D2 · Replay `turn_events` on hydrate.** `hydrate.ts` currently reads `games.state` and the seat roster, then calls `registry.create` — the in-memory `eventLog` starts empty, so `?lastSeq=` delta replay after restart always falls back to full welcome. Fix: after creating the Room, `select seq, turn, actor_id, action, resulting_hash from turn_events where room_id=$1 order by seq asc` and push synthesized entries onto `room.eventLog` with the effects slot left empty (late-joiners won't ever re-run those effects since they haven't seen prior ones). This gives correct delta replay; the hash chain stays consistent because we include `resulting_hash`.
- **D3 · Per-intent seat authority.** `ws/index.ts` validates seat/user at open time; `Room.applyIntent` only asserts `seatIdx === currentPlayerIdx`. A client with a stale session state could spoof `seatIdx`. Fix: the WS handler already has `session.userId`; thread it into `applyIntent` as an optional `expectedUserId`, and have the Room cross-check the seat's `userId` against it. Breaks nothing since AI seats have `userId: null` and are driven via `applyAsCurrent` which skips the check.
- **D4 · Presence frame.** `ServerPresenceSchema` exists but the client dispatcher `useRoomDispatcher` has a no-op handler. Low-value polish; skip unless cheap.

### E. Regression net

- **E1 · Extend `solo-playthrough.test.ts`** to cover the reinforce-drain-to-zero case — fire all reserves, assert the store advances past `reinforce` without manual intervention.
- **E2 · Add `mp-two-humans` hydrate-after-restart** case: launch a room, apply N actions, tear down the registry, call `ensureHydrated`, connect a second WS with `?lastSeq=K`, assert delta frames arrive.
- **E3 · Keep `scripts/smoke.ts` green** — 982 actions, 0 engine errors.
- **E4 · Keep lint and typecheck at zero.**

---

## 3. Non-goals

- No UI re-design.
- No Mission Risk variant.
- No Turnstile/signup route (Track F Task 1 stays deferred).
- No `pg_cron` tick edge function (deferred to multi-instance sprint).
- No admin panel (Track G).
- No Playwright browser scenario (blocked on Supabase test-JWT helper, still deferred).
- No 500-game balance rerun.

---

## 4. Pipeline

Opus 4.7 implementer sub-agents, each in an isolated worktree branch off `claude/game-fix-2026-04-23`. Gates are enforced by the orchestrator (Mara): typecheck + full test suite + lint + smoke + solo-playthrough must all stay green before a worktree merges back.

```
Gate 1 — A + B in parallel (independent files)
  A-worker → claude/game-fix-2026-04-23/loop
  B-worker → claude/game-fix-2026-04-23/render

Gate 2 — C alongside A/B
  C-worker → claude/game-fix-2026-04-23/rules-coverage

Gate 3 — D after A+B merge (MP depends on loop being playable)
  D-worker → claude/game-fix-2026-04-23/mp-wiring

Gate 4 — E integration tests as part of each worker's PR
```

Each worker follows the persona's loop contract: TDD where feasible, typecheck + full test suite before report-done, biome clean, scope-prefixed commits (`engine:`, `ai:`, `web:`, `server:`, `shared:`, `test:`, `docs:`).

---

## 5. Success criteria

- `bun run typecheck` — 7/7 workspaces.
- `bun run test` — ≥ 350 tests pass (baseline 338 + ~12 new).
- `bun run lint` — 0 errors.
- `bun run scripts/smoke.ts` — 982 actions, 0 engine errors, winner ≤ turn 20.
- `apps/web/src/test/solo-playthrough.test.ts` — still green under 600 ms.
- Manual solo: launch → play through reinforce/attack/fortify without stalls → victory modal opens → rematch works. No visible map icon twitching during AI turns.
- Manual MP (single-browser smoke via paste-JWT path): create room → add AI seat → launch → play a full turn → server container restart mid-game → reconnect → state resumes.

---

## 6. File inventory (expected touch set)

| Workstream | Files (expected) |
|---|---|
| A | `apps/web/src/routes/Play.tsx`, `PlayRoom.tsx`, `dossier/Dossier.tsx`, `game/useSoloDispatcher.ts`, `game/phase.ts`, `packages/engine/src/reducer.ts` (reinforce auto-advance only) |
| B | `apps/web/src/map/Node.tsx`, `Map.tsx`, `UnitSilhouette.tsx`, `dossier/DicePanel.tsx`, `game/useGame.ts` (selector split) |
| C | `packages/engine/src/setup.ts`, `packages/engine/test/*.ts` |
| D | `apps/server/src/rooms/Room.ts`, `hydrate.ts`, `registry.ts`, `persistence/games.ts` (new), `ws/index.ts` |
| E | `apps/web/src/test/solo-playthrough.test.ts`, `apps/server/test/mp-two-humans.test.ts` (extend), engine tests (from C) |

No schema migrations beyond 0016 (already present). No new dependencies.

---

## 7. Out-of-scope observations (logged, not fixed)

- Migrations 0013 (launch trigger) and 0014 (pg_cron tick) are dead code in the DB but harmless. Leave as-is; remove in a future cleanup sprint.
- The `aiPlayerIdForSeat` scheme (`seat-N-ai`) works but couples engine player-ids to seat indexes. Fine for v1.
- Solo's `aiRunner.ts` still uses `dilettanteTurn` hardcoded; future sprints can wire it to persona-aware selection. Unrelated to this spec.
