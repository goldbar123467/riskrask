# Track B — Engine Port Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. TDD strictly. Use `bun test` from `packages/engine/`.

**Goal:** Port the v2 HTML file's game mechanics into `packages/engine` as a pure, deterministic, typed module with an action reducer and full test coverage.

**Architecture:** No I/O, no DOM. One `GameState` object + a pure `apply(state, action) → { next, effects }` reducer. Seedable RNG. State hashing for desync detection.

**Reference:** `archive/riskindex-v2-mobile.html`. Search for the `freshState`, `startGame`, `runOneRoll`, `onTerritoryCaptured`, `doFortify`, `calcReinforcements`, `nextTradeValue`, `validSet`, `CONTINENTS`, `TERR_DATA`, `ADJ_PAIRS`, `STARTING_ARMIES`, and `CARD_TYPES` identifiers to find the authoritative mechanics.

**Tech Stack:** TypeScript, `bun test`, zod (for runtime state validation at boundaries).

**Worktree:** `.claude/worktrees/track-b-engine` (create with `EnterWorktree name: "track-b-engine"`).

---

## File structure

| File | Purpose |
|---|---|
| `packages/engine/src/board.ts` | Constants: continents, bonuses, territories, adjacencies, starting armies, card deck |
| `packages/engine/src/types.ts` | `GameState`, `PlayerState`, `TerritoryState`, `Card`, `Phase`, `Action`, `Effect`, `LogEntry` |
| `packages/engine/src/rng.ts` | Seedable PRNG (mulberry32) with `nextInt(max)` and `rollDie()` |
| `packages/engine/src/hash.ts` | `hashState(s)` → 16-char hex (FNV-1a over canonical JSON) |
| `packages/engine/src/setup.ts` | `createInitialState(config)`, `claimTerritory`, `setupReinforce` |
| `packages/engine/src/reinforce.ts` | `calcReinforcements`, `placeReinforcement` |
| `packages/engine/src/cards.ts` | `buildDeck`, `validSet`, `tradeValue`, `tradeCards`, `drawCard` |
| `packages/engine/src/combat.ts` | `rollAttack`, `resolveRoll`, `blitz` |
| `packages/engine/src/fortify.ts` | `canFortify` (connectivity), `doFortify` |
| `packages/engine/src/victory.ts` | `checkElimination`, `checkVictory` |
| `packages/engine/src/reducer.ts` | `apply(state, action) → { next, effects }` dispatcher |
| `packages/engine/src/index.ts` | Re-exports |
| `packages/engine/test/*` | One test file per source file |

## Tasks

### Task 1: Scaffold types + board constants

**Files:** `packages/engine/src/types.ts`, `packages/engine/src/board.ts`, `packages/engine/test/board.test.ts`.

- [ ] **Step 1: Write failing test**

```ts
// packages/engine/test/board.test.ts
import { describe, expect, test } from 'bun:test';
import { CONTINENTS, TERRITORIES, ADJ_PAIRS, STARTING_ARMIES, BOARD_TERRITORY_COUNT } from '../src/board';

describe('board constants', () => {
  test('has 42 territories', () => {
    expect(Object.keys(TERRITORIES)).toHaveLength(42);
    expect(BOARD_TERRITORY_COUNT).toBe(42);
  });
  test('has 6 continents', () => {
    expect(Object.keys(CONTINENTS)).toHaveLength(6);
  });
  test('every territory belongs to exactly one continent', () => {
    for (const name of Object.keys(TERRITORIES)) {
      const hits = Object.values(CONTINENTS).filter((c) => c.members.includes(name));
      expect(hits).toHaveLength(1);
    }
  });
  test('adjacency is symmetric', () => {
    for (const [a, b] of ADJ_PAIRS) {
      expect(ADJ_PAIRS.some(([x, y]) => x === b && y === a) || ADJ_PAIRS.some(([x, y]) => x === a && y === b)).toBe(true);
    }
  });
  test('starting armies table covers 3–6 players', () => {
    expect(STARTING_ARMIES).toEqual({ 3: 35, 4: 30, 5: 25, 6: 20 });
  });
});
```

- [ ] **Step 2: Run test to verify failure**

```
cd packages/engine && bun test test/board.test.ts
```

Expected: FAIL, module not found.

- [ ] **Step 3: Write `types.ts`**

Port verbatim from v2 `freshState()` output shape + v2 player model. Required exports: `Phase`, `PlayerState`, `TerritoryState`, `Card`, `LogEntry`, `Action`, `Effect`, `GameState`. Make every field explicit and `readonly` where it isn't mutated post-apply.

- [ ] **Step 4: Write `board.ts`**

Copy `CONTINENTS`, `TERR_DATA` (rename to `TERRITORIES`), `EDGE_EXIT_PAIRS`, and the `buildAdjPairs()` computation from v2. Export `ADJ_PAIRS` as a frozen readonly array of tuples. Export `ADJACENCY: Record<TerritoryName, readonly TerritoryName[]>` for O(1) lookup. Export `STARTING_ARMIES`, `CARD_TYPES`, `PALETTE`, `BOARD_TERRITORY_COUNT = 42`.

- [ ] **Step 5: Run tests to verify pass**

```
bun test test/board.test.ts
```

Expected: 5/5 pass.

- [ ] **Step 6: Commit**

```
git add packages/engine/src/{types,board}.ts packages/engine/test/board.test.ts
git commit -m "engine: board constants + core types"
```

### Task 2: Seedable RNG

**Files:** `packages/engine/src/rng.ts`, `packages/engine/test/rng.test.ts`.

- [ ] **Step 1: Failing test**

```ts
import { describe, expect, test } from 'bun:test';
import { createRng, rollDie } from '../src/rng';

describe('rng', () => {
  test('same seed produces identical sequence', () => {
    const a = createRng('seed-1');
    const b = createRng('seed-1');
    const aOut = Array.from({ length: 20 }, () => rollDie(a));
    const bOut = Array.from({ length: 20 }, () => rollDie(b));
    expect(aOut).toEqual(bOut);
  });
  test('dies are 1..6', () => {
    const r = createRng('x');
    for (let i = 0; i < 1000; i++) {
      const v = rollDie(r);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(6);
    }
  });
  test('cursor advances by 1 per roll', () => {
    const r = createRng('c');
    rollDie(r); rollDie(r); rollDie(r);
    expect(r.cursor).toBe(3);
  });
});
```

- [ ] **Step 2: Run to verify failure**

- [ ] **Step 3: Implement `rng.ts`**

```ts
export interface Rng { seed: string; cursor: number; state: number; }

function hash32(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function createRng(seed: string): Rng {
  return { seed, cursor: 0, state: hash32(seed) };
}

function next(rng: Rng): number {
  rng.state = (rng.state + 0x6D2B79F5) >>> 0;
  let t = rng.state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  rng.cursor++;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function nextInt(rng: Rng, maxExclusive: number): number {
  return Math.floor(next(rng) * maxExclusive);
}

export function rollDie(rng: Rng): number { return nextInt(rng, 6) + 1; }
```

- [ ] **Step 4: Pass test; Step 5: Commit.**

### Task 3: State hash

**Files:** `packages/engine/src/hash.ts`, `packages/engine/test/hash.test.ts`.

- [ ] **Step 1: Failing test** — hash same state → same output, mutated state → different output, 16-char hex format.

- [ ] **Step 2–3: Implement FNV-1a over `JSON.stringify` with a stable key order**

```ts
function canonical(v: unknown): string {
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (v && typeof v === 'object') {
    const keys = Object.keys(v as Record<string, unknown>).sort();
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonical((v as Record<string, unknown>)[k])).join(',') + '}';
  }
  return JSON.stringify(v);
}
export function hashState(s: unknown): string {
  const str = canonical(s);
  let h1 = 0xcbf29ce4n, h2 = 0x84222325n;
  const prime = 0x100000001b3n;
  for (let i = 0; i < str.length; i++) {
    const c = BigInt(str.charCodeAt(i));
    h1 = ((h1 ^ c) * prime) & 0xffffffffffffffffn;
    h2 = ((h2 ^ (c << 7n)) * prime) & 0xffffffffffffffffn;
  }
  return (h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0')).slice(0, 16);
}
```

- [ ] **Step 4–5: Pass tests, commit.**

### Task 4: Initial state + setup phase

**Files:** `packages/engine/src/setup.ts`, `packages/engine/test/setup.test.ts`.

Tests assert:
- `createInitialState({ seed, players: [...] })` produces a state where all 42 territories exist with `owner: null, armies: 0`, `phase: 'setup-claim'`, `turn: 0`, and each player has `reserves === STARTING_ARMIES[numPlayers]`.
- After the claim phase completes (all 42 territories owned), state auto-advances to `setup-reinforce`.
- After every player has placed all their reserves, state advances to `reinforce` for player 0.

Implementation notes from v2: replicate `freshState()` and the `advanceSetupReinforce()` logic.

### Task 5: Card deck + trades

**Files:** `packages/engine/src/cards.ts`, test file.

Test: deck has 42 + 2 wilds, `validSet` accepts three-of-a-kind and one-of-each-plus-optional-wild, `tradeValue(n)` follows v2's progression (4, 6, 8, 10, 12, 15, 20, 25, ...). On trade, cards return to `discard`, not deleted; if territory bonus applies, +2 armies to the matching owned territory.

### Task 6: Reinforcements

**Files:** `packages/engine/src/reinforce.ts`, test.

Test:
- `calcReinforcements(state, playerId)` = `max(3, floor(owned/3)) + continentBonuses`.
- Placing a reinforcement decrements `player.reserves` and increments `territory.armies`. Cannot place on territory not owned. Cannot place more than remaining reserves.

### Task 7: Combat

**Files:** `packages/engine/src/combat.ts`, test.

Test:
- `rollAttack(state, srcName, tgtName)` (single roll): must own src, must be adjacent, src armies > 1. Dies counts: attacker `min(3, src.armies - 1)`, defender `min(2, tgt.armies)`. Resolve pairs by sorted-descending, ties defender. Update armies. If defender reaches 0, attacker owns territory and moves minimum `diceRolled` armies.
- `blitz(state, srcName, tgtName)`: repeat until capture or src.armies === 1.
- Victory check + card draw handled by reducer, not combat.

Test uses seeded RNG to assert exact dice outcomes.

### Task 8: Fortify + connectivity

**Files:** `packages/engine/src/fortify.ts`, test.

Test:
- `canFortify(state, srcName, tgtName, playerId)` returns true iff both owned, connected via owned territories (BFS), src.armies > 1.
- `doFortify` moves N armies (`1 ≤ N ≤ src.armies - 1`). Only one fortify per turn; enforced by reducer consuming `hasFortified` flag.

### Task 9: Victory + elimination

**Files:** `packages/engine/src/victory.ts`, test.

Test:
- Eliminating a player transfers their cards to attacker, marks `eliminated: true`, releases all their territories? (No — they already lost them individually; just mark eliminated.)
- If attacker now holds ≥6 cards post-elimination, `pendingForcedTrade: true`.
- `checkVictory(state)` returns winner if exactly one non-eliminated player.

### Task 10: Action reducer

**Files:** `packages/engine/src/reducer.ts`, test.

Implements `apply(state, action): { next: GameState; effects: Effect[] }`. Every branch delegates to the module above. Invalid actions throw `EngineError` with a stable `code`. Tests cover every action type on both valid and invalid inputs.

Key actions: `claim-territory`, `setup-reinforce`, `reinforce`, `trade-cards`, `attack` (one roll), `attack-blitz`, `move-after-capture`, `end-attack-phase`, `fortify`, `end-turn`, `concede`.

### Task 11: Fuzz test for invariants

**Files:** `packages/engine/test/fuzz.test.ts`.

- [ ] Write a test that runs 200 full games with random-but-legal moves chosen from a seeded RNG and asserts:
  - Total armies across the board never go negative.
  - Sum of `player.reserves + territories owned*1` is conserved only during placement phases (sanity check).
  - No territory has `armies < 1` while `owner != null`.
  - Every state hashes the same when re-applied from turn 0 with the same seed + actions (determinism).

### Task 12: Public index + integration

**Files:** `packages/engine/src/index.ts`.

Re-export `apply`, `createInitialState`, all types, constants, `hashState`, `createRng`.

### Task 13: Final commit + PR message

```
engine: complete port of v2 mechanics to pure TS reducer

- 12 modules, each with bun:test coverage
- seedable RNG with cursor for replay parity
- state hashing for desync detection
- fuzz test: 200 random games, zero invariant violations

Ref: docs/superpowers/specs/2026-04-19-riskrask-v3-design.md §5
```
