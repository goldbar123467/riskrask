# Track D — React Web Client Plan (Command Console)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. TDD on stateful logic; visual work verified in dev server + Playwright.

**Goal:** Build the React + Vite player client in `apps/web` covering the solo-mode golden path (setup → game loop → victory) against the **Command Console** visual direction. Multiplayer wiring arrives in Track F; this track must leave a clean seam for it.

**Reference mockups (read before coding):**
- `design/mockups/command-console.html` — layout, tokens, HUD composition
- `design/mockups/command-console-screenshot.png` — tonal reference
- `design/mockups/README.md` — what to take vs ignore

Territory coordinates come from `packages/engine/src/board.ts` (ported in Track B) — **not** from the mockup's placeholder positions.

**Tech Stack:** React 18, Vite, Tailwind, Zustand, TanStack Query, Framer Motion, `react-zoom-pan-pinch`, Vitest + RTL, Playwright.

**Worktree:** `.claude/worktrees/track-d-web`.

**Dependency:** Track B (engine) must be merged first. The engine exposes `GameState`, `Action`, `apply()`, `createInitialState()`, and per-territory positional metadata via `TERRITORIES[name]`.

---

## Theme tokens

Already set in `apps/web/src/theme/tokens.css` by Phase 0. Do not edit them unless the design spec §3 changes. Use Tailwind utilities mapped to these CSS variables.

## File structure

| File | Purpose |
|---|---|
| `src/main.tsx` | Bootstrap |
| `src/App.tsx` | Router + Query + root layout |
| `src/routes/Home.tsx` | Landing: new-game / enter-save-code / resume last |
| `src/routes/Setup.tsx` | Setup wizard (player count, archetype picker, start) |
| `src/routes/Play.tsx` | Live Console shell containing the grid |
| `src/routes/Replay.tsx` | Stub — full build in Track H |
| `src/console/Shell.tsx` | Grid layout: brand / topbar / rail / stage / dossier / statusbar |
| `src/console/Brand.tsx` | 72×56 rotated-square mark cell |
| `src/console/Topbar.tsx` | Session # · Turn · Phase · Clock · Players · icon-buttons |
| `src/console/Rail.tsx` | Vertical nav MAP/ARMY/INTEL/DIPL/LOG/HELP, swaps dossier content |
| `src/console/Statusbar.tsx` | LINK / TICK / LAT / WINDOW cells |
| `src/stage/Stage.tsx` | Map host: zoom/pan wrapper + corner HUDs + phase tabs + zoom control |
| `src/stage/PhaseTabs.tsx` | Draft / Deploy / Attack / Fortify / End — derived from `state.phase` and reinforcement/trade flags |
| `src/stage/ZoomControl.tsx` | +/– + fit buttons, disabled during Setup |
| `src/stage/StageHud.tsx` | 4 corner overlays: theatre / coordinates / legend / selected-callout |
| `src/map/Map.tsx` | SVG root (viewBox 0 0 1500 960), renders world.svg, grid, continents, edges, nodes |
| `src/map/WorldLayer.tsx` | Imports `/assets/world.svg` as a module and pastes outline + boundaries |
| `src/map/ContinentLabel.tsx` | Per-continent title with glow filter and bonus tspan |
| `src/map/AdjacencyLines.tsx` | Dashed edges; long edges get the `sea` style |
| `src/map/Node.tsx` | One territory marker: hex/diamond/shield shell + unit silhouette + count + name label |
| `src/map/UnitSilhouette.tsx` | Four SVG silhouettes: tank/drone/jet/inf — ported from mockup |
| `src/map/SelectedOverlay.tsx` | Crosshair ring + callout for selected territory |
| `src/dossier/Dossier.tsx` | Scrollable sidebar host; switches sections based on `Rail` active item |
| `src/dossier/CommanderCard.tsx` | Crest + name + tag row |
| `src/dossier/DeployPanel.tsx` | Big `DEPLOY` headline + readouts + progress + Confirm/Cancel — shown when phase === reinforce (placement) |
| `src/dossier/DraftPanel.tsx` | Card-trade UI (three-of-a-kind / one-of-each detection) — shown when phase === reinforce (trade step) |
| `src/dossier/AttackPanel.tsx` | Src/Tgt + Single/Blitz/End buttons + last-roll dice |
| `src/dossier/FortifyPanel.tsx` | Src/Tgt + army slider + Confirm/Skip |
| `src/dossier/PowersList.tsx` | Per-player chip/name/territories/armies/bar; me-row highlight |
| `src/dossier/IntelFeed.tsx` | Last 4 log entries with timestamps |
| `src/dossier/DicePanel.tsx` | 3×2 dice grid (attacker above, defender below) with shake |
| `src/game/useGame.ts` | Zustand store: `state`, `dispatch(action)`, `effects`, `selected`, `hover` |
| `src/game/useSoloDispatcher.ts` | Calls engine `apply`; runs AI turns via a setTimeout queue so dice animate |
| `src/game/aiRunner.ts` | Wraps `@riskrask/ai.takeTurn(state, playerId, rng)` into a dispatch loop |
| `src/game/selectors.ts` | Pure helpers: `myPlayer(state)`, `myReinforcementsRemaining(state)`, `continentBonuses(state, pid)`, `isClickable(state, name, selected)`, `canBlitz(state, src, tgt)`, etc. |
| `src/game/phase.ts` | Maps engine phase + sub-flags to UI label (Draft/Deploy/Attack/Fortify/End) |
| `src/modals/ForcedTradeModal.tsx` | Mid-attack + end-of-turn forced card trade |
| `src/modals/MoveModal.tsx` | Post-capture move-armies picker (min = dice rolled) |
| `src/modals/VictoryModal.tsx` | Winner + share code + rematch |
| `src/modals/SaveCodeModal.tsx` | `POST /api/saves`, display `XXXX-XXXX`, copy + URL |
| `src/net/api.ts` | Typed `fetch` wrappers for `/api/saves/*` |
| `src/net/ws.ts` | WebSocket client stub (real impl in Track F) |
| `src/hooks/useHotkey.ts` | Keyboard shortcuts (`1-5` phase tabs, `Space` = confirm, `Esc` = cancel) |
| `src/hooks/useClock.ts` | Countdown (solo = decorative; multiplayer = server deadline) |
| `src/test/setup.ts` | RTL + jest-dom |
| `e2e/solo-game.spec.ts` | Playwright: solo game seed → victory |

Keep each file ≤300 lines. Split further if a component's internals exceed that.

## Canonical conventions

- Faction colors come from player.factionKey: `usa | rus | chn | eu | neu`. The palette has no more than 5 slots; a 6th player is recycled from `neu` — no extra colors invented.
- Every clickable territory state has three props: `{ owned: boolean; selected: boolean; targetable: boolean }`. No other booleans allowed in `<Node>`.
- Dice animations: 600ms shake, then static for 1.2s before the next roll. Blitz advances on each roll without UI click.
- Intel feed: subscribe to the last 4 entries of `state.log`. Long lines truncate with ellipsis — no word wrap.
- Confirmation buttons are ALWAYS a pair: left = danger/cancel, right = primary/confirm. No single-button modals.

## Tasks

### Task 1: Shell + grid

- [ ] `src/console/Shell.tsx` implements the `72px | 1fr | 380px` + `56 / 1 / 48` grid from design spec §3.1. Accepts `<Brand/>`, `<Topbar/>`, `<Rail/>`, children (stage), `<Dossier/>`, `<Statusbar/>` slots.
- [ ] Vitest test: mounts `<Shell>` with dummy slots, asserts each area renders in its labeled region.
- [ ] Commit.

### Task 2: Brand + Topbar + Rail + Statusbar

- [ ] All four are pure presentational. No store reads. Props in, JSX out.
- [ ] Brand: 28×28 rotated-square mark with hot-accent inner dot.
- [ ] Topbar: accepts `session`, `turn`, `phase`, `clock`, `players` strings; renders the 5-cell layout.
- [ ] Rail: accepts `activeItem: 'map'|'army'|'intel'|'dipl'|'log'|'help'`, `onSelect`. Hot-accent bar on the left edge of active item.
- [ ] Statusbar: accepts `{ link: 'stable'|'lagging'|'down'; tickLabel; latencyMs; windowLabel }`.
- [ ] One RTL test per component.

### Task 3: Game store + solo dispatcher

- [ ] `useGame`: `{ state: GameState | null; selected: TerritoryName | null; hoverTarget: TerritoryName | null; effectsQueue: Effect[]; dispatch(action) }`.
- [ ] `useSoloDispatcher`: wraps engine `apply`. On phase change, if current player is AI, enqueue `takeTurn` actions with 450ms throttle so the UI animates.
- [ ] Test: 3-AI game runs to a winner in <500 turns given seed `'solo-test-1'`. Must remain deterministic.

### Task 4: Map — world layer + grid + continents + edges

- [ ] `Map.tsx` renders an SVG with viewBox `0 0 1500 960`.
- [ ] Import `world.svg` as a raw string via Vite's `?raw` suffix. Extract `#outline` and `#boundaries` paths via regex at module load, cached.
- [ ] Render in z order: lat/long grid, world outline (fill `#0e131a`, stroke `rgba(150,170,200,0.22)`), boundaries, continent titles, adjacency edges.
- [ ] `ContinentLabel` uses the glow filter from the mockup (`feGaussianBlur` + `feMerge`).
- [ ] `AdjacencyLines` marks edges whose euclidean length exceeds 260 as `sea` (shorter dash pattern).

### Task 5: Map — nodes and selection

- [ ] `Node.tsx` draws the hex shell, unit silhouette (tank default; mix option randomizes by hash of territory name), underline, count, label below. Owner color drives stroke + count color.
- [ ] Selection state props in; no global access. Root `<Map>` manages selection and passes down.
- [ ] Clicking: `onSelect(name)` bubbles up. If no current selection and the territory is not mine (in attack phase), do nothing. If mine in reinforce phase → selects. If mine in attack phase → selects as source. If selected-as-source and clicking an adjacent enemy territory → sets as target (but doesn't attack — the AttackPanel's "Single/Blitz" buttons fire the action).
- [ ] `SelectedOverlay`: dashed ring + crosshair + callout showing `▸ {NAME}` / `OWN · {armies} → {action_hint}` / borders list.
- [ ] Test: Click on owned territory in attack phase; assert `selected` updates. Click on adjacent enemy; assert `target` updates. Click on non-adjacent territory; assert no target change.

### Task 6: Dossier sections

- [ ] `Dossier.tsx` switches its middle "phase hero" panel based on `UIPhase` from `phase.ts`:
  - Draft → `<DraftPanel>` (card trade)
  - Deploy → `<DeployPanel>`
  - Attack → `<AttackPanel>` + `<DicePanel>`
  - Fortify → `<FortifyPanel>`
- [ ] `CommanderCard`, `PowersList`, `IntelFeed` are always visible.
- [ ] `PowersList` highlights the "me" row with a faction-tinted gradient stripe.
- [ ] `IntelFeed` reads `state.log.slice(-4).reverse()`, renders timestamp + sentence.

### Task 7: Setup wizard

- [ ] `/setup` route. Steps:
  1. Player count (3–6) + host faction.
  2. Per seat: human or AI; if AI, archetype dropdown (from `@riskrask/ai`).
  3. Starting seed (random default, editable for replay).
- [ ] On "Launch", `createInitialState({ seed, players })` and navigate to `/play`.
- [ ] No multiplayer hooks here; that's Track F.

### Task 8: Modals

- [ ] `ForcedTradeModal`: shown when `state.pendingForcedTrade` is set. Presents three-of-a-kind / one-of-each options; player picks one.
- [ ] `MoveModal`: armies slider `[diceRolled, src.armies-1]`.
- [ ] `VictoryModal`: winner name, shareable code (from Save API), Rematch button (re-enters setup with same players).
- [ ] `SaveCodeModal`: `POST /api/saves`, shows `XXXX-XXXX` with copy button + `riskrask.com/?save=XXXXXXXX`.

### Task 9: URL save loading

- [ ] On `/?save=CODE` mount, Home component calls `GET /api/saves/:code`, migrates, then navigates to `/play` with the loaded state.
- [ ] Error states: 404 → "save not found", 410 → "save expired".

### Task 10: Hotkeys + clock

- [ ] `useHotkey('1'..'5')` jumps between phase tabs (only those that are legal for the current state).
- [ ] `Space` = primary-action; `Esc` = cancel.
- [ ] `useClock` counts down from `state.phaseDeadlineMs` if present; otherwise hidden.

### Task 11: Responsive collapse

- [ ] Below 900px width, Dossier becomes a bottom sheet with a toggle button; Stage takes full width. Rail collapses to a top tab strip.
- [ ] Test: Playwright mobile-chrome project asserts sheet toggles.

### Task 12: Playwright golden path

- [ ] `e2e/solo-game.spec.ts`: launch with seed `'pw-1'`, 2 AI dilettantes + 1 human. Scripted clicks play Deploy → Attack (one blitz) → Fortify → End. Repeat until victory is declared. Spec passes in <30s on CI.

### Task 13: Commit + merge

Final commit message:

```
web(track-d): Command Console UI for solo golden path

- Shell grid + Brand/Topbar/Rail/Statusbar
- Stage with world map, phase tabs, zoom, 4 HUDs, selection overlay
- Dossier: CommanderCard, phase-specific panel, PowersList, IntelFeed, DicePanel
- Zustand game store + solo dispatcher + AI runner
- Setup wizard, save-code modal, URL save loading
- Playwright solo golden-path green

Ref: docs/superpowers/specs/2026-04-19-riskrask-v3-design.md §3, §4
Mockups: design/mockups/command-console.*
```
