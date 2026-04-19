# Balance Proposals — 2026-04-19

**Source dataset:** `reports/balance-2026-04-19.jsonl` (500 seeded games, uniform
over 3–6 players, all 9 archetypes sampled without replacement).
**Aggregated report:** `docs/balance/balance-2026-04-19.md`.

## Headline numbers

| Metric | Observed | Comment |
|---|---|---|
| Victories | 92 / 500 (18.4%) | Baseline. Most games stalemate at the 250-turn / 12k-action cap. |
| Timeouts | 408 / 500 (81.6%) | Global signal: the AI is too passive. |
| Avg turns / game | 177.2 | 26.8% of games run past 200 turns. |
| 4-player max win rate | `vengeful` 7.5% | Nothing breaks the 40% dominance threshold — 4p is reasonably balanced. |
| `hermit` win rate | 2 / 244 (0.8%) | **Underperformer** — flagged by rule. 0% wins in 4p/5p/6p; beats nobody ≥ 2%. |
| Hot continents | SA 31.5, AF 26.6, EU 20.4, AU 16.8 flips/game | Small-continent thrash — expected, not a fix target on its own. |

## Targets

Three proposals. All three are weight-only; none touch the mechanics, voice
packs, or action shapes. Expected win rates are best-guesses from the
dataset — they need a fresh 500-game run after the change to verify.

---

### Proposal 1 — Unstick the `hermit` (file: `packages/ai/src/arch.ts`)

**Why this archetype:** `hermit` wins 0.8% across 244 games. In 4-player
and 5-player games it wins **zero** games. It loses every head-to-head
matchup at ≤ 1.8% (matchup row all-zeros with one exception).

**Mechanism:** two weights combine to make `hermit` a sitting duck.

- `ruleMods.noAttackBeforeTurn: 5` — forbids every attack before turn 5.
  In a game whose average length is 177 turns, 5 turns of embargo is small.
  Against faster archetypes (napoleon, jackal), 5 turns is enough for
  opponents to lock down 2-3 territories that hermit can never contest.
- `weights.reinforce.adjFriendly: 0.3` — near-zero incentive to cluster
  armies. Every other archetype sits at ≥ 0.5. Hermit fans troops thin.
  Combined with `nearContinent: 0.5`, it also ignores expansion pressure.

**Proposed change:**

```diff
   hermit: {
     ...
     weights: {
       reinforce: {
-        adjFriendly: 0.3,
+        adjFriendly: 1.0,
       },
     },
-    ruleMods: { noAttackBeforeTurn: 5 },
+    ruleMods: { noAttackBeforeTurn: 3 },
   },
```

**Before / after expectations:**

| Metric | Before (measured) | After (expected) |
|---|---|---|
| overall win rate | 0.8% | 3.0 – 4.0% |
| 4p win rate | 0.0% | 1.5 – 2.5% |
| 6p win rate | 0.0% | 1.0 – 2.0% |

3.0–4.0% lands `hermit` inside the pack (`fortress`, `patient`) without
overshooting the leading archetypes' 5–6% baseline. Isolationist identity
is preserved — 3 turns of dormancy still forces `hermit` to sit out the
scramble phase, but the clustering weight gives it a real "wall of armies"
to emerge with.

---

### Proposal 2 — Make `fortress` viable in large games (file: `packages/ai/src/arch.ts`)

**Why this archetype:** `fortress` wins 17.4% of 3-player games — the
#4 archetype in that bracket — but drops to **1.6% in 4p and 0.0% in both
5p and 6p**. Its walls hold against one opponent; against three they
get ground down while fortress refuses to counterattack.

**Mechanism:**

- `weights.attack.hopelessPenalty: 2.0` — the most risk-averse attack
  weighting in the catalog. In a 5p/6p game, fortress hits so many
  "good-enough" defenders that it effectively never commits, while the
  surrounding players trade territory and grow past it.
- `rubberBand: { leaderBonus: 0.0, trailerBonus: 0.0 }` — fortress never
  heats up when it's falling behind. Stays in its defensive groove even
  when standing < -0.5.

**Proposed change:**

```diff
   fortress: {
     ...
     weights: {
       attack: {
-        hopelessPenalty: 2.0,
+        hopelessPenalty: 1.5,
       },
     },
-    rubberBand: { leaderBonus: 0.0, trailerBonus: 0.0 },
+    rubberBand: { leaderBonus: 0.0, trailerBonus: -0.25 },
   },
```

**Before / after expectations:**

| Metric | Before (measured) | After (expected) |
|---|---|---|
| 3p win rate | 17.4% | 12 – 15% (slight tax) |
| 5p win rate | 0.0% | 2.0 – 4.0% |
| 6p win rate | 0.0% | 1.5 – 3.0% |

The `trailerBonus` of -0.25 *drops* runtime temperature when fortress is
behind (more focused, deterministic picks) which matches the Maginot
identity. The 2.0 → 1.5 hopelessPenalty drop keeps fortress's cautious
profile but stops it from declining almost every commit in the late-game
when dice variance has already shaved off its advantage.

---

### Proposal 3 — Break the stalemate floor (files: `packages/ai/src/band.ts`, `packages/ai/src/regret.ts`)

**Why:** this is the *global* problem in the dataset — 81.6% of games
stall at the action cap. Average game runs 177 turns, 26.8% of games
exceed 200. Two compounding feedback loops drive this:

1. `Band.recalibrate` scales `trailerBonus * -standing`, but three
   archetypes (`hermit`, `fortress`, `shogun`) have `trailerBonus: 0` —
   they *never* adapt when losing. A trailing fortress stays in
   fortress mode and the game grinds down.
2. `Regret.update` allows `hopelessPenalty` to drift up to `1.6× base`.
   After a run of bad dice (which happens in any long game), an
   archetype's effective attack weighting becomes so cautious that it
   stops committing. Regret then has no negative feedback to pull it
   back down. This is the "archetype locks into passive" loop.

**Proposed change to `band.ts` (establish a universal trailer floor):**

```diff
 export function recalibrate(
   state: GameState,
   ps: PersonaState,
   arch: ArchDef,
   playerId: PlayerId,
 ): PersonaState {
   const s = standing(state, playerId);
   const baseT = arch.temperature;
   const rb = arch.rubberBand;
-  const delta = s > 0 ? rb.leaderBonus * s : rb.trailerBonus * -s;
+  // Universal trailer floor: ensure every trailing archetype heats up at
+  // least -0.1 when standing goes below zero, even if their rubberBand
+  // config is 0. Preserves personality for archetypes that already heat
+  // up more aggressively (napoleon -0.3, vengeful -0.4).
+  const trailerEffective = Math.min(rb.trailerBonus, -0.1);
+  const delta = s > 0 ? rb.leaderBonus * s : trailerEffective * -s;
   const newT = Math.max(0.1, baseT + delta + ps.regretTempAccum);
   return { ...ps, runtimeTemperature: newT };
 }
```

**Proposed change to `regret.ts` (tighten the hopelessPenalty upper clamp):**

```diff
   w.hopelessPenalty = clampNum(
     w.hopelessPenalty + 0.05 * combined,
     baseW.hopelessPenalty * 0.7,
-    baseW.hopelessPenalty * 1.6,
+    baseW.hopelessPenalty * 1.25,
   );
```

Both edits preserve the *direction* of the existing feedback loops but
cap how far they can drift. Archetypes can still become more cautious
after bad dice, just less catastrophically so.

**Before / after expectations:**

| Metric | Before (measured) | After (expected) |
|---|---|---|
| Global victory rate | 18.4% | 28 – 35% |
| Timeout rate | 81.6% | 65 – 72% |
| Games past 200 turns | 26.8% | 15 – 20% |
| `hermit` win rate (combined with Proposal 1) | 0.8% | 4 – 5% |
| `fortress` 5p win rate (combined with Proposal 2) | 0.0% | 3 – 5% |

---

## Next steps

1. Do **not** ship these yet — they're proposals for review.
2. To verify, the plan is: branch → apply one proposal at a time → rerun
   `bun --filter @riskrask/scripts balance` with `BALANCE_GAMES=500` →
   compare to this report. Validate the *direction* of change matches
   expected, then stack.
3. If all three land without negative surprises, ship to main and the
   weekly cron (`.github/workflows/balance.yml`) will keep monitoring.

## How to replay a specific outlier game

Every game record in the JSONL has a `seed`. To reproduce a game locally:

```ts
import { createInitialState, apply } from '@riskrask/engine';
import { takeTurn } from '@riskrask/ai';

const seed = 'bal-42'; // copy from the JSONL line of interest
// ...then mirror `scripts/balance-harness.ts` → `simulate()`
```

Because the setup RNG (`${seed}:setup`) and AI RNG (`${seed}:ai`) are
derived from the seed, the exact same game plays out turn-for-turn.
