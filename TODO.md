# Riskrask — Resume Point

_Last updated 2026-04-20 after an audit against `riskrules.md`._

## Context in one paragraph

The engine is **mostly** right for Classic Risk (dice, continent bonuses, trade escalation, BFS fortify), but a few rules are either wrong or missing, and **the AI is a placeholder** (`dilettanteTurn`) which is why the last balance run (`docs/balance/balance-2026-04-20.md`) had an **81.6% stalemate rate over 500 games** (177 avg turns). The UI mostly works for a human vs. AI solo round, but many rule gaps mean games don't feel like Risk. The world-map SVG has been removed from the stage as requested.

## Just done

- **UI: removed world map background**
  - Deleted `apps/web/src/map/WorldLayer.tsx`.
  - Removed import + `<WorldLayer />` render from `apps/web/src/map/Map.tsx`.
  - Map now shows: lat/long grid → continent fills → adjacency lines → territory nodes. No world outline/boundaries.
  - **Verify**: `bun run dev:web`, open `/play` — continent fill tints + node positions should still read clearly. If not, bump continent fill alpha in `board.ts` `CONTINENTS[*].color` from `0.08` to `~0.15`.
- **Wrote `riskrules.md`**
  - Canonical classic-Risk reference. All engine changes below should cite it.

## P0 — rule bugs that break classic feel

1. **Card territory bonus is placed in `reserves`, not on the matched territory.**
   - `packages/engine/src/cards.ts:134-138` — the `+2` is added to `player.reserves`.
   - Classic rule (`riskrules.md` §4.1.3): the 2 extra armies are placed **on the specific matching territory**, immediately.
   - Fix: `tradeCards()` should return a `territoryBonus` payload that the reducer uses to bump `territories[name].armies += 2`, *not* reserves.
   - Touchpoints: `cards.ts` `TradeResult`, `reducer.ts::applyTradeCards`.

2. **Forced card trade at 5 cards is unenforced.**
   - `PendingForcedTrade` + `'five-card-limit'` reason exist in `types.ts:46-49,104` but no reducer path sets `pendingForcedTrade` or blocks `reinforce` until the trade happens.
   - Fix: at start of each `applyReinforce` / `advanceTurn` into `reinforce`, if `player.cards.length >= 5`, set `pendingForcedTrade` and reject everything except `trade-cards` until resolved.

3. **Mid-attack forced trade on elimination is unenforced.**
   - `riskrules.md` §4.2.7: if you eliminate a player and that takeover pushes your hand to ≥ 6, you **must immediately** trade sets down to < 5 before continuing the attack phase.
   - `reducer.ts::applyMoveAfterCapture` calls `transferCardsOnElimination` but doesn't check hand size / set `pendingForcedTrade`.
   - Fix: after transfer, if hand ≥ 6 set `pendingForcedTrade = { reason: 'elimination' }` and gate further attack actions.

4. **Fortify uses connected-through-owned BFS instead of classic "one adjacent move".**
   - `packages/engine/src/fortify.ts:9-42` implements the BFS "free move" house rule.
   - Classic Hasbro rule: only one adjacent territory (`riskrules.md` §4.3).
   - Decision needed (pick one, don't ship both):
     - Option A — change `canFortify` to require `ADJACENCY[src].includes(tgt)`.
     - Option B — keep BFS, but add a rulebook flag in `GameConfig` (`fortifyRule: 'adjacent' | 'connected'`).

5. **Two-player variant missing.**
   - `packages/engine/src/setup.ts:47` throws `Unsupported player count: 2`.
   - Classic rules support 2 via a Neutral third color (`riskrules.md` §3.5).
   - Low priority for v1 — stub out or explicitly document "3–6 only" in the UI.

## P1 — AI is the main reason games stalemate

6. **Wire `@riskrask/ai` into `aiRunner.ts`.**
   - `apps/web/src/game/aiRunner.ts:7-10` TODO(Track F). Currently returns `dilettanteTurn` (random-ish) rather than the real archetype system in `packages/ai/src/`.
   - Per `docs/balance/balance-2026-04-20.md`, dilettante wins 4.2%; real archetypes only hit 6.0% (napoleon) because the simulation is *also* using dilettante — pure random on both sides dominates the sim.
   - Fix: expose a `takeTurn(state, playerId, rng, persona)` from `packages/ai/src/index.ts`, and call it from `aiRunner.ts`. Then re-run the balance sim harness.

7. **Stalemate suppression.**
   - 81.6% timeout at 177 turns is not a balance problem, it's an AI problem (players never press a winning advantage) + board-size problem (continent flips: SA 31.5×, EU 20.4×, AF 26.6× per game).
   - Short term: make AI more aggressive once it holds a continent (apply a "press" bonus in the AI planner).
   - Long term: consider turn-cap victory-by-territory-count (not classic; flag as house rule).

## P2 — polish and plumbing

8. **Server endpoints are stubs.**
   - `apps/server/src/http/saves.ts:7` — TODO wire real Turnstile verify.
   - `apps/server/src/auth/verify.ts` — TODO real Cloudflare Access JWT verify.
   - No multiplayer yet; only save/load by code.

9. **UI cleanup after removing the world background.**
   - Continent labels and fills should still orient the player. Re-check contrast on `ContinentLabel.tsx` vs. the darker stage background.
   - Consider deleting `apps/web/public/assets/world.svg` if nothing else imports it (`design/mockups/*` still does — fine to keep file).

10. **Docs drift.**
    - `docs/superpowers/plans/2026-04-19-track-d-web.md:45-46` still references `WorldLayer.tsx`. Mark deprecated or remove lines.

## Suggested first commit after this one

Pick **item 1** (card territory bonus). It's isolated (touches `cards.ts` + `applyTradeCards` + one test), fully specified by classic rules, and will make card plays feel right without needing a broader rebalance.

## Files to read first when you resume

- `riskrules.md` — rules source of truth.
- `packages/engine/src/reducer.ts` — action handlers; where most of the fixes above land.
- `packages/engine/src/cards.ts` — P0 #1.
- `packages/engine/src/fortify.ts` — P0 #4.
- `apps/web/src/game/aiRunner.ts` — P1 #6.
- `docs/balance/balance-2026-04-20.md` — current "this is broken" data.
