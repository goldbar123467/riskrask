/**
 * Balance harness — headless Bun script that simulates full games using the
 * real @riskrask/engine reducer and the @riskrask/ai `takeTurn` orchestrator.
 *
 * For each of N games:
 *   - player count is chosen (default: uniform over {3,4,5,6})
 *   - that many archetypes are sampled without replacement from ARCH_IDS
 *   - seed is `bal-<idx>` for determinism / replayability
 *   - setup phases use random unclaimed / random owned (same as engine fuzz test)
 *   - main game uses @riskrask/ai.takeTurn per player
 *   - continent flips are tracked per continent
 *
 * Each game record is appended as one JSONL line to
 *   reports/balance-<YYYY-MM-DD>.jsonl
 *
 * Usage:
 *   bun run scripts/balance-harness.ts                 # default N=500
 *   BALANCE_GAMES=50 bun run scripts/balance-harness.ts
 *   BALANCE_GAMES=500 BALANCE_OUT=reports/custom.jsonl bun run scripts/balance-harness.ts
 *
 * Completes in a few minutes for N=500 on a modern box. Each game is capped
 * at MAX_TURNS to prevent pathological stalemates.
 */

import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { Arch, type ArchId, takeTurn } from '@riskrask/ai';
import {
  type Action,
  CONTINENTS,
  type GameState,
  type PlayerId,
  TERR_ORDER,
  apply,
  createInitialState,
  createRng,
  hashState,
  nextInt,
  ownedBy,
} from '@riskrask/engine';

const ARCH_IDS = Arch.ids;

const DEFAULT_GAMES = Number(process.env.BALANCE_GAMES ?? '500');
// A dilettante-vs-dilettante cold stalemate can run indefinitely; 250 turns
// and ~12k actions cover the vast majority of games that *do* terminate and
// is our signal for the "game >200 turns" outlier rule.
const MAX_TURNS = Number(process.env.BALANCE_MAX_TURNS ?? '250');
const MAX_ACTIONS_PER_GAME = Number(process.env.BALANCE_MAX_ACTIONS ?? '12000');
const PLAYER_COUNTS = [3, 4, 5, 6] as const;

type PlayerCount = (typeof PLAYER_COUNTS)[number];

const FACTION_COLORS = ['#dc2626', '#2563eb', '#059669', '#d97706', '#7c3aed', '#ec4899'] as const;

interface PlayerSetup {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  readonly isAI: true;
  readonly archId: ArchId;
}

interface GameRecord {
  schemaVersion: 1;
  seed: string;
  playerCount: number;
  players: { id: string; archId: ArchId }[];
  outcome: 'victory' | 'timeout' | 'error';
  winnerArchId: ArchId | null;
  winnerId: string | null;
  /** On `timeout`, we pick the player with the most territories at the cap. */
  leaderArchId: ArchId | null;
  leaderId: string | null;
  leaderTerritories: number;
  turnsPlayed: number;
  actionsApplied: number;
  continentFlips: Record<string, number>;
  finalHash: string;
  errorMessage?: string;
  wallMs: number;
}

function buildPlayers(archIds: readonly ArchId[]): PlayerSetup[] {
  return archIds.map((archId, idx) => ({
    id: `p${idx}`,
    name: `${archId}-${idx}`,
    color: FACTION_COLORS[idx % FACTION_COLORS.length] ?? '#888',
    isAI: true,
    archId,
  }));
}

/** Sample `k` archetypes without replacement, using `rng`. */
function sampleArchetypes(k: PlayerCount, rng: ReturnType<typeof createRng>): ArchId[] {
  const pool: ArchId[] = [...ARCH_IDS];
  const out: ArchId[] = [];
  for (let i = 0; i < k; i++) {
    const idx = nextInt(rng, pool.length);
    const pick = pool.splice(idx, 1)[0];
    if (pick) out.push(pick);
  }
  return out;
}

/** Compute the current owner of each continent, or `null` if contested/empty. */
function continentOwners(state: GameState): Record<string, string | null> {
  const owners: Record<string, string | null> = {};
  for (const key of Object.keys(CONTINENTS)) {
    const c = CONTINENTS[key];
    if (!c) continue;
    let owner: string | null | undefined;
    let contested = false;
    for (const name of c.members) {
      const t = state.territories[name];
      if (!t) continue;
      if (t.owner === null) {
        contested = true;
        break;
      }
      if (owner === undefined) owner = t.owner;
      else if (owner !== t.owner) {
        contested = true;
        break;
      }
    }
    owners[key] = contested ? null : (owner ?? null);
  }
  return owners;
}

/** Pick a setup-phase action (claim or setup-reinforce) for the current player. */
function setupPickAction(state: GameState, rng: ReturnType<typeof createRng>): Action | null {
  const cp = state.players[state.currentPlayerIdx];
  if (!cp) return null;

  if (state.phase === 'setup-claim') {
    const unclaimed = TERR_ORDER.filter((n) => state.territories[n]?.owner === null);
    if (unclaimed.length === 0) return null;
    const pick = unclaimed[nextInt(rng, unclaimed.length)];
    return pick ? { type: 'claim-territory', territory: pick } : null;
  }

  if (state.phase === 'setup-reinforce') {
    if (cp.reserves <= 0) return null;
    const owned = TERR_ORDER.filter((n) => state.territories[n]?.owner === cp.id);
    if (owned.length === 0) return null;
    const pick = owned[nextInt(rng, owned.length)];
    return pick ? { type: 'setup-reinforce', territory: pick } : null;
  }

  return null;
}

interface SimResult {
  state: GameState;
  turnsPlayed: number;
  actionsApplied: number;
  continentFlips: Record<string, number>;
  outcome: 'victory' | 'timeout' | 'error';
  errorMessage?: string;
}

function simulate(players: readonly PlayerSetup[], seed: string): SimResult {
  const archById: Record<string, ArchId> = {};
  for (const p of players) archById[p.id] = p.archId;

  let state = createInitialState({ seed, players: players.map((p) => ({ ...p })) });
  const setupRng = createRng(`${seed}:setup`);
  const aiRng = createRng(`${seed}:ai`);

  const continentFlips: Record<string, number> = {};
  for (const key of Object.keys(CONTINENTS)) continentFlips[key] = 0;

  let prevContinentOwners = continentOwners(state);
  const trackFlips = (next: GameState): void => {
    const cur = continentOwners(next);
    for (const key of Object.keys(cur)) {
      if (cur[key] !== prevContinentOwners[key])
        continentFlips[key] = (continentFlips[key] ?? 0) + 1;
    }
    prevContinentOwners = cur;
  };

  let actionsApplied = 0;
  let turnsPlayed = 0;
  let errorMessage: string | undefined;

  try {
    // --- Setup phases ---
    while (
      (state.phase === 'setup-claim' || state.phase === 'setup-reinforce') &&
      actionsApplied < MAX_ACTIONS_PER_GAME
    ) {
      const action = setupPickAction(state, setupRng);
      if (!action) break;
      const { next } = apply(state, action);
      state = next;
      actionsApplied++;
      trackFlips(state);
    }

    // --- Main game: takeTurn per current player ---
    while (
      state.phase !== 'done' &&
      turnsPlayed < MAX_TURNS &&
      actionsApplied < MAX_ACTIONS_PER_GAME
    ) {
      const cp = state.players[state.currentPlayerIdx];
      if (!cp || cp.eliminated) break;

      const archId = archById[cp.id] ?? 'dilettante';
      // Note: the engine reducer does not enforce `pendingForcedTrade` — it's
      // only a UI hint the multiplayer web client reacts to. `takeTurn` /
      // `doTrades` already drain every tradeable set at the start of the
      // turn, so we don't need to handle the flag here.

      const priorTurn = state.turn;
      const priorIdx = state.currentPlayerIdx;

      const actions = takeTurn(state, cp.id as PlayerId, aiRng, archId);
      if (actions.length === 0) {
        // takeTurn produced nothing — engine is in a state it can't act from.
        // Fall back to end-turn to unstick and avoid infinite loop.
        try {
          const { next } = apply(state, { type: 'end-turn' });
          state = next;
          actionsApplied++;
          trackFlips(state);
        } catch {
          break;
        }
      } else {
        for (const action of actions) {
          const { next } = apply(state, action);
          state = next;
          actionsApplied++;
          trackFlips(state);
          if (state.phase === 'done') break;
        }
      }

      // A "turn played" increments if either the turn counter advanced or the
      // active player changed (some paths leave turn fixed but rotate seat).
      if (state.turn !== priorTurn || state.currentPlayerIdx !== priorIdx) turnsPlayed++;
    }

    return {
      state,
      turnsPlayed,
      actionsApplied,
      continentFlips,
      outcome: state.phase === 'done' ? 'victory' : 'timeout',
    };
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
    return {
      state,
      turnsPlayed,
      actionsApplied,
      continentFlips,
      outcome: 'error',
      errorMessage,
    };
  }
}

function dateStamp(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
    d.getUTCDate(),
  ).padStart(2, '0')}`;
}

export function runHarness(n: number, outPath: string): GameRecord[] {
  const results: GameRecord[] = [];
  const combosRng = createRng('balance-combo-rng');

  if (!existsSync(dirname(outPath))) mkdirSync(dirname(outPath), { recursive: true });
  // Truncate if the file exists — a single harness run writes one complete batch.
  writeFileSync(outPath, '');

  const startAll = Date.now();

  for (let i = 0; i < n; i++) {
    const playerCount = PLAYER_COUNTS[nextInt(combosRng, PLAYER_COUNTS.length)] ?? 3;
    const archIds = sampleArchetypes(playerCount, combosRng);
    const players = buildPlayers(archIds);
    const seed = `bal-${i}`;

    const t0 = Date.now();
    const sim = simulate(players, seed);
    const wallMs = Date.now() - t0;

    const winnerId = sim.state.winner ?? null;
    const winnerArchId = winnerId
      ? (archIds[players.findIndex((p) => p.id === winnerId)] ?? null)
      : null;

    // Leader = player with most territories at end. Used for win-rate proxy
    // on stalemates so the full dataset stays usable.
    let leaderId: string | null = null;
    let leaderCount = -1;
    for (const p of sim.state.players) {
      if (p.eliminated) continue;
      const n = ownedBy(sim.state, p.id as PlayerId).length;
      if (n > leaderCount) {
        leaderCount = n;
        leaderId = p.id;
      }
    }
    const leaderArchId = leaderId
      ? (archIds[players.findIndex((p) => p.id === leaderId)] ?? null)
      : null;

    const record: GameRecord = {
      schemaVersion: 1,
      seed,
      playerCount,
      players: players.map((p) => ({ id: p.id, archId: p.archId })),
      outcome: sim.outcome,
      winnerArchId,
      winnerId,
      leaderArchId,
      leaderId,
      leaderTerritories: Math.max(0, leaderCount),
      turnsPlayed: sim.turnsPlayed,
      actionsApplied: sim.actionsApplied,
      continentFlips: sim.continentFlips,
      finalHash: hashState(sim.state),
      ...(sim.errorMessage ? { errorMessage: sim.errorMessage } : {}),
      wallMs,
    };
    results.push(record);
    appendFileSync(outPath, `${JSON.stringify(record)}\n`);

    if ((i + 1) % 25 === 0 || i + 1 === n) {
      const pct = Math.round(((i + 1) / n) * 100);
      const elapsedS = ((Date.now() - startAll) / 1000).toFixed(1);
      const victories = results.filter((r) => r.outcome === 'victory').length;
      process.stdout.write(
        `  [${i + 1}/${n}  ${pct}%]  elapsed ${elapsedS}s  victories=${victories}  timeouts=${
          results.filter((r) => r.outcome === 'timeout').length
        }\n`,
      );
    }
  }

  return results;
}

function isMain(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return resolve(entry) === resolve(new URL(import.meta.url).pathname);
}

if (isMain()) {
  // Always resolve to repo-root `reports/`, regardless of where bun was invoked.
  const repoRoot = resolve(new URL(import.meta.url).pathname, '../..');
  const out = process.env.BALANCE_OUT ?? join(repoRoot, 'reports', `balance-${dateStamp()}.jsonl`);
  console.log(`balance-harness: N=${DEFAULT_GAMES}  out=${out}`);
  const results = runHarness(DEFAULT_GAMES, out);
  const victories = results.filter((r) => r.outcome === 'victory').length;
  const timeouts = results.filter((r) => r.outcome === 'timeout').length;
  const errors = results.filter((r) => r.outcome === 'error').length;
  const avgTurns = results.reduce((s, r) => s + r.turnsPlayed, 0) / results.length;
  const avgActions = results.reduce((s, r) => s + r.actionsApplied, 0) / results.length;
  console.log(
    `done. victories=${victories} timeouts=${timeouts} errors=${errors} avg_turns=${avgTurns.toFixed(
      1,
    )} avg_actions=${avgActions.toFixed(0)}`,
  );
}
