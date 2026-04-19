# Track D — React Web Client Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. TDD on stateful logic; visual work verified in dev server + Playwright.

**Goal:** Build the React + Vite player client in `apps/web` covering the solo-mode golden path: setup screen → game round loop → victory. Port the v2 Cold-War aesthetic, mobile tabs, and SVG map. Multiplayer wiring arrives in Track F.

**Architecture:**
- `routes/` for top-level pages; `components/` for shared UI; `map/` for SVG territory rendering; `game/` for Zustand stores + engine bindings; `net/` stubs the WebSocket client (used in Track F).
- Engine + AI packages consumed as workspace deps.
- Solo mode runs engine in-process; the same UI works for multiplayer by swapping the store's dispatcher.

**Reference:** `archive/riskindex-v2-mobile.html` for DOM structure, SVG rendering in `renderMap()`, sidebar in `renderSidebar()`, controls in `renderControls()`, setup screen in `initSetupScreen()`, mobile tabs in `wireMobileTabs()`.

**Worktree:** `.claude/worktrees/track-d-web`.

**Dependency:** Engine types from Track B. Can start in parallel by stubbing types if B is late.

---

## File structure

| File | Purpose |
|---|---|
| `src/main.tsx` | Bootstrap |
| `src/App.tsx` | Router + Query + theme providers |
| `src/routes/Home.tsx` | Landing + "new game" + "load save code" |
| `src/routes/Play.tsx` | Setup screen OR active game |
| `src/routes/Replay.tsx` | (stub; finished in Track H) |
| `src/game/useGame.ts` | Zustand store wrapping an engine state + dispatch |
| `src/game/useSoloDispatcher.ts` | Dispatch that applies actions locally via `apply` |
| `src/game/aiRunner.ts` | Runs `takeTurn` for AI players between human turns |
| `src/map/Map.tsx` | SVG map with pan/zoom |
| `src/map/Territory.tsx` | Single node (circle + label + army count) |
| `src/map/AdjacencyLines.tsx` | Static adjacency graph |
| `src/map/PulseLayer.tsx` | Attack-line pulse animations |
| `src/components/Sidebar.tsx` | Player roster + turn info + dice panel |
| `src/components/Controls.tsx` | Phase-specific action buttons |
| `src/components/DicePanel.tsx` | 3D-ish dice renderer (port v2 `makeDie`) |
| `src/components/LogPanel.tsx` | Scrolling log with continent badges |
| `src/components/MobileTabs.tsx` | Bottom tab bar + auto-switch |
| `src/components/SetupScreen.tsx` | Player slot editor, archetype picker, voice preview |
| `src/components/Modal.tsx` | Shared modal shell |
| `src/components/ForcedTradeModal.tsx` | Mid-attack forced card-trade UI |
| `src/components/MoveModal.tsx` | Post-capture move-armies picker |
| `src/components/SaveCodeModal.tsx` | Share this save UI (hits `/api/saves` in Track E) |
| `src/theme/tokens.css` | CSS variables (copied from v2) |
| `src/theme/index.css` | Tailwind layers + global resets |
| `src/test/setup.ts` | RTL + jest-dom setup |
| `e2e/solo-game.spec.ts` | Playwright golden path |

## Tasks

### Task 1: Providers + router

- [ ] `App.tsx` with `BrowserRouter`, `QueryClientProvider`, a `<ThemeTokens />` no-op that ensures tokens.css is loaded, and routes for `/`, `/play`, `/play/:roomId`, `/replay/:id`.
- [ ] Vitest test: renders `Home` at `/`.
- [ ] Commit.

### Task 2: Zustand store + solo dispatcher

- [ ] `useGame`: holds `state: GameState | null`, `effectsBuffer: Effect[]`, `dispatch(action)`.
- [ ] `useSoloDispatcher`: calls `apply(state, action)`; pushes effects; advances AI turns automatically via `aiRunner`.
- [ ] Test: fire `claim-territory` actions for 4 seats; assert store state matches engine state.

### Task 3: SVG map

- [ ] Port v2 `renderMap()`'s layout (node positions are stored on `TERRITORIES` from engine's `board.ts`; add `x`, `y` fields there if not already — Track B note).
- [ ] `Map.tsx` wraps `react-zoom-pan-pinch` + an SVG `<svg viewBox>`; renders `AdjacencyLines` + all `Territory` nodes.
- [ ] `Territory.tsx` props: `{ name, owner, armies, selected, source, target, onSelect }`. Filters/drop-shadow match v2 selectors (`.node-group.selected`, `.source`, `.target`).
- [ ] Tween army count via Framer Motion's `animate(value)` or a simple `useTween` hook that mirrors `tweenNumber` from v2.
- [ ] Vitest render test.

### Task 4: Setup screen

- [ ] Player-count slider (3–6).
- [ ] Per-slot: name input, archetype picker with description, "human/AI" toggle.
- [ ] "Start game" button → calls engine `createInitialState` → navigates to `/play`.
- [ ] Keyboard scroll behaviour from v2 `wireSetupKeyboardScroll`.

### Task 5: Round loop UI

- [ ] Sidebar shows current player + phase + reinforcements-remaining + card count + current continent bonuses.
- [ ] Controls change per phase. Reinforce: "Place 1 here" or multi-place via number input. Attack: "Roll one" / "Blitz". Fortify: source/target picker with army slider. "End phase" button always available when legal.
- [ ] Dice panel shows last roll with shake animation.
- [ ] Log panel tails the state's log array.

### Task 6: Mobile tabs + auto-switch

- [ ] Bottom tab bar (Map / Controls / Log / Roster).
- [ ] Auto-switch mirrors v2 `autoSwitchTab()` — watch `state.phase` and route.
- [ ] Manual override flag so user can stay on a tab if they tapped it.

### Task 7: Modals

- [ ] Forced trade (mid-attack and end-of-turn).
- [ ] Move armies after capture (min = dice rolled, max = src.armies - 1).
- [ ] Victory + "new game" + "share code" modals.

### Task 8: Save code flow (solo)

- [ ] `SaveCodeModal` calls `POST /api/saves` with the current state and displays the returned code as `XXXX-XXXX` with a copy button + shareable URL.
- [ ] On `?save=CODE` URL param, Home auto-fetches and navigates to `/play`.
- [ ] In Track E the server endpoint exists; in this track, stub the fetch behind a feature flag or mock.

### Task 9: Playwright golden path

- [ ] Spin up dev server, configure 3-player game (2 AI dilettante + 1 human), play to end with scripted clicks; assert a victor is announced. Allow the fuzz-style test to be seeded via a `?seed=` URL param wired in Task 2.

### Task 10: Commit + PR

```
web: React + Vite client covering solo golden path

- Router, Zustand game store, solo dispatcher
- SVG map with pan/zoom and territory tweens
- Setup screen, round-loop controls, dice/log panels
- Mobile tabs with auto-switch
- Save-code modal, Playwright solo golden-path spec

Ref: docs/superpowers/specs/2026-04-19-riskrask-v3-design.md §3, §4
```
