# Riskrask — Resume Point

_Last updated 2026-04-21 after the fortify-rule flag landed._

## Context in one paragraph

The engine is **mostly** right for Classic Risk (dice, continent bonuses, trade escalation, BFS fortify), but a few rules are either wrong or missing, and **the AI is a placeholder** (`dilettanteTurn`) which is why the last balance run (`docs/balance/balance-2026-04-20.md`) had an **81.6% stalemate rate over 500 games** (177 avg turns). The UI mostly works for a human vs. AI solo round, but many rule gaps mean games don't feel like Risk. The world-map SVG has been removed from the stage as requested.

## Just done (2026-04-21)

- **Engine: fortify rule flag (P0 #4)**
  - New `FortifyRule = 'adjacent' | 'connected'` type exported from `@riskrask/engine`.
  - `GameConfig.fortifyRule?` (default `'adjacent'`) is threaded into `createInitialState`, persisted on `GameState.fortifyRule`, and read by `canFortify`. Missing field on legacy saves falls back to `'adjacent'` — the classic Hasbro 2008+ rule that has been in force since commit `ae4e7dc`.
  - `canFortify` now rejects `src === tgt` explicitly (was previously a silent no-op via the adjacency lookup).
  - `connectedThroughOwned` is now the reach check under `'connected'`; otherwise strict adjacency via `ADJACENCY[src].includes(tgt)`.
  - Tests: `packages/engine/test/fortify.test.ts` gains two blocks — one exercising the `'connected'` path through Alaska → NT → Ontario and a broken-chain case, another asserting `createInitialState` defaults to `'adjacent'` and honours `'connected'` when passed.
  - Touchpoints: `packages/engine/src/fortify.ts:55`, `packages/engine/src/setup.ts:29`, `packages/engine/src/types.ts` (new `FortifyRule` + `GameState.fortifyRule`).
- **Engine: two-player Neutral variant (§3.5)**
  - `STARTING_ARMIES[2] = 40`; `createInitialState` synthesises a 3rd `isNeutral: true` seat when `players.length === 2` and strips the 2 wild cards from the deck.
  - `advanceTurn` skips Neutral, so Neutral never reinforces / attacks / earns cards in the main game.
  - `checkVictory` ignores Neutral when counting contenders — a human wins by eliminating all *other* humans.
  - Setup UI (`apps/web/src/routes/Setup.tsx`) exposes **2** in the player-count picker with a "beta" note explaining the Neutral injection.
  - New `isNeutral?: boolean` on `PlayerState`; exported `NEUTRAL_ID`, `NEUTRAL_COLOR` from `@riskrask/engine`.
  - Tests: `packages/engine/test/setup.test.ts` (neutral injection, 40 reserves, no wilds); `packages/engine/test/victory.test.ts` (neutral excluded); `packages/engine/test/reducer.test.ts` (end-turn skips Neutral).
  - **Caveat**: we keep the existing turn-by-turn claim/place flow rather than the strict "deal 3 piles of 14" setup from classic. Neutral plays via `dilettanteTurn` (random) in setup. Good enough for v1.
- **Server: real Cloudflare Access JWT + Turnstile verify**
  - `apps/server/src/auth/verify.ts::verifyAdminJwt` now fetches `https://<team>.cloudflareaccess.com/cdn-cgi/access/certs`, verifies the RS256 signature via `crypto.subtle`, checks `aud` against `CF_ACCESS_AUD`, and honours `exp` / `nbf`. JWKS is cached for 1h.
  - New `apps/server/src/auth/turnstile.ts` does siteverify round-trips. Gated by `TURNSTILE_REQUIRED=1`; silent no-op when unset or when the caller is already JWT-authenticated.
  - Wired into `POST /api/saves` for anonymous requests; returns 403 `TURNSTILE_REQUIRED` on failure.
  - `.env.example` gains `TURNSTILE_REQUIRED`.
  - Tests: `apps/server/test/turnstile.test.ts` covers the off/on/missing/valid/invalid paths.
- **UI: contrast sweep after world-SVG removal**
  - `ContinentLabel.tsx` fill alpha bumped 0.25 → 0.45 (main) and 0.15 → 0.30 (+bonus tspan).
  - `CONTINENTS[*].color` alpha bumped 0.08 → 0.14 so continent blocks read on the darker stage.
- **Docs drift**
  - `docs/superpowers/plans/2026-04-19-track-d-web.md` Task 4 + file-structure table no longer mention `WorldLayer.tsx`. Viewbox corrected to `0 0 1000 640`.

## Just done (2026-04-20)

- **UI: removed world map background**
  - Deleted `apps/web/src/map/WorldLayer.tsx`.
  - Removed import + `<WorldLayer />` render from `apps/web/src/map/Map.tsx`.
  - Map now shows: lat/long grid → continent fills → adjacency lines → territory nodes. No world outline/boundaries.
- **Wrote `riskrules.md`**
  - Canonical classic-Risk reference. All engine changes below should cite it.

## P0 — rule bugs that break classic feel

1. **Card territory bonus** — _done_ (see `apps/web`/engine commit `ae4e7dc`).
2. **Forced card trade at 5 cards** — _done_ (commit `ae4e7dc`).
3. **Mid-attack forced trade on elimination** — _done_ (commit `ae4e7dc`).
4. **Fortify rule** — _done 2026-04-21_. `canFortify` already flipped to strict adjacency in `ae4e7dc`; this commit adds the `GameConfig.fortifyRule` flag (`'adjacent'` default, `'connected'` opt-in) and wires it through `GameState`.
5. **Two-player Neutral variant** — _done 2026-04-21_.

## P1 — AI is the main reason games stalemate

6. **`@riskrask/ai` wired into `aiRunner.ts`** — _done_ (commit `ae4e7dc`). Re-run the balance harness on the new archetype path and replace `docs/balance/balance-2026-04-20.md` with a fresh report.
7. **Stalemate suppression.**
   - 81.6% timeout at 177 turns with dilettante-only. Re-measure first, then decide if a "press" bonus on held continents is still needed.
   - Long term: consider turn-cap victory-by-territory-count (not classic; flag as house rule).

## P2 — polish and plumbing

8. **Server endpoints** — _done 2026-04-21_. Turnstile + CF Access JWT are now real. Remaining: no multiplayer endpoints yet (Track F).
9. **UI cleanup after removing the world background** — _done 2026-04-21_ (ContinentLabel + board alpha bumps). Revisit only if Playwright screenshots show regressions.
10. **Docs drift** — _done 2026-04-21_.

## Suggested first commit after this one

Re-run `scripts/balance-harness.ts` and write `docs/balance/balance-2026-04-21.md`. With the AI now wired via `@riskrask/ai.takeTurn` (ae4e7dc) and the classic fortify rule flag locked in, the baseline from `balance-2026-04-20.md` is stale — P1 #7 (stalemate suppression) depends on fresh data before any "press bonus" is considered.

## Files to read first when you resume

- `riskrules.md` — rules source of truth.
- `packages/engine/src/reducer.ts` — action handlers.
- `packages/engine/src/setup.ts` — 2P Neutral injection.
- `packages/engine/src/fortify.ts` — P0 #4.
- `apps/server/src/auth/verify.ts` + `apps/server/src/auth/turnstile.ts` — the new gate modules.
- `docs/balance/balance-2026-04-20.md` — baseline data; will be stale after the next harness run.
