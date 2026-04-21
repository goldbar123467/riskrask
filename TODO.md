# Riskrask — Resume Point

_Last updated 2026-04-21 after the AI closeout sprint landed._

## Context in one paragraph

The engine plays full Classic Risk (dice, continent bonuses, trade escalation,
adjacent-only fortify by default with a `'connected'` opt-in, two-player
Neutral variant). The AI orchestrator (`@riskrask/ai.takeTurn`) now closes
games aggressively: the fresh 200-game harness run (`docs/balance/balance-2026-04-21.md`)
lands at **98.5% victory / 1.5% stalemate / 66 avg turns** — a huge swing from
the 22% / 78% / 172 baseline that opened this sprint. Every archetype ships
with a 16–28% win rate so all nine have a path to victory. The solo UI runs
smoothly with adaptive AI pacing (setup 60 ms, move 140 ms, dice 420 ms) and
an intel feed that actually reflects engine events. The project is in ship-
ready shape for the solo-play target; multiplayer (Track F) is the next
beachhead.

## Just done (2026-04-21 — AI closeout sprint)

- **AI orchestrator: press-mode closeout**
  - Raised `MAX_ATTACKS_PER_TURN` 8 → 32 so leaders can sweep full chains in
    a single late-game turn.
  - Replaced the `attacksMade >= 1 && maxSrc <= 3` bail heuristic (the single
    largest stalemate driver) with a territory-share-based press mode that
    kicks in once the AI owns ≥ 50% of the map. In press mode the AI keeps
    attacking on any dice-favoured edge (`2v1 ≈ 58%`, `3v1 ≈ 92%`) instead of
    stopping at the first sub-zero score.
  - File: `packages/ai/src/orchestrator.ts`.

- **AI scoring: scaled eliminate/hopeless bonuses**
  - `scoreAttack` now scales the eliminate bonus smoothly from
    `opp.territories == 6` down to `1`, with a +30 kicker for the finishing
    blow. The old binary `≤ 3` cutoff missed the critical "knock them down to
    1" step.
  - Hopeless penalty: softened from a single `src.armies <= tgt.armies` gate
    (−50) to tiered `<`/`=` buckets (−40 / −10) so marginal but winnable
    engagements (3v3 blitz, 4v3 odds) stop scoring as suicide.
  - File: `packages/ai/src/persona.ts`.

- **AI fortify: rewrote scoring**
  - Old rule required pure-interior source tiles, which left lopsided stacks
    on quiet borders while active fronts thinned out.
  - New rule: maximise enemy-pressure delta. Any owned source with ≥2 armies
    can push toward any owned neighbour with strictly greater enemy pressure,
    plus a small bias for emptying interiors.
  - File: `packages/ai/src/persona.ts::scoreFortifyOptions`.

- **Web: real rematch flow**
  - `VictoryModal` → Rematch now rebuilds a fresh `GameState` with the same
    human/AI roster and a new seed via `createInitialState`, rather than
    bouncing the user back to `/setup` with stale state.
  - File: `apps/web/src/routes/Play.tsx::handleRematch`.

- **Web: adaptive AI tempo**
  - Solo dispatcher now picks one of three tick speeds by phase: setup 60 ms,
    reinforce/trade/fortify/end 140 ms, attack 420 ms. Dice roll animation
    (600 ms shake) still reads clearly but closeout turns no longer drag.
  - File: `apps/web/src/game/useSoloDispatcher.ts`.

- **Web: working intel feed**
  - The engine keeps log text in its effect channel (pure reducer discipline);
    `state.log` was never populated, so the Intel pane rendered "No events
    yet" permanently. The UI store now accumulates log + capture +
    elimination + victory effects into a rolling 200-entry `log` slice, and
    `IntelFeed` reads that.
  - Files: `apps/web/src/game/useGame.ts`, `apps/web/src/dossier/IntelFeed.tsx`.

- **Web: dispatcher hardened**
  - `runAiStep` now wraps each dispatch in a try/catch so a stale mid-batch
    action can't crash the tick; the next tick recomputes from the current
    state.
  - File: `apps/web/src/game/useSoloDispatcher.ts`.

- **Balance: 200-game rerun**
  - `docs/balance/balance-2026-04-21.md` reflects the closeout AI. Headline:
    98.5% victory / 1.5% stalemate / 66 avg turns / 2 542 avg actions.
  - Per-archetype win rates span 16.3% (fortress) → 27.8% (shogun); every
    archetype has 80 + samples, so the spread is signal, not noise.

## Still open

### P1 — multiplayer

- No multiplayer endpoints yet (Track F). Solo console is complete.

### P2 — polish

- Dice animation could use a real face-dots visual instead of numerals; not a
  shipping blocker for v1.
- Intel feed deduplication: repeated captures in a blitz chain can spam the
  feed. Cap at N per turn if the feed starts to feel noisy in playtesting.
- No tooltips on the map nodes; armies/continent/adjacency are visible but an
  on-hover tooltip would help new players.

## Suggested first commit after this one

If another pass is desired, Track F (multiplayer) is the next beachhead. Short
of that, a 500-game harness rerun will tighten archetype win-rate CIs — the
200-game spread at the archetype level is still ± 3 pp on the high end — but
the story at the headline level is done: stalemates are gone.

## Files to read first when you resume

- `riskrules.md` — rules source of truth.
- `packages/ai/src/orchestrator.ts` — press-mode + `MAX_ATTACKS_PER_TURN`.
- `packages/ai/src/persona.ts` — `scoreAttack`, `scoreFortifyOptions`.
- `apps/web/src/game/useGame.ts` + `useSoloDispatcher.ts` — UI state + AI tempo.
- `apps/web/src/routes/Play.tsx::handleRematch` — rematch flow.
- `docs/balance/balance-2026-04-21.md` — current baseline (200 games).
