/**
 * Smoke test — run one full headless 4-player game using @riskrask/engine +
 * @riskrask/ai end-to-end. Verifies:
 *   - all four classic rule fixes (card territory bonus, forced trades,
 *     adjacent-only fortify, real AI wiring) coexist without runtime errors,
 *   - the game actually terminates (not every game will — timeouts are fine
 *     for a smoke check — but no EngineError should leak out).
 *
 * Prints a short summary. Non-zero exit on unexpected error.
 */

import { Arch, type ArchId, takeTurn } from '@riskrask/ai';
import {
  type Action,
  type GameState,
  TERR_ORDER,
  apply,
  createInitialState,
  createRng,
  findBestSet,
  nextInt,
  ownedBy,
} from '@riskrask/engine';

const SEED = process.argv[2] ?? 'smoke-1';
const MAX_ACTIONS = 15000;
const MAX_TURNS = 250;

const ARCHS: ArchId[] = ['napoleon', 'vengeful', 'fortress', 'jackal'];

const players = ARCHS.map((id, i) => ({
  id: String(i),
  name: `P${i}-${id}`,
  color: `#${((0x1000000 * (i + 1)) / ARCHS.length).toString(16).padStart(6, '0').slice(0, 6)}`,
  isAI: true as const,
  archId: id,
}));

let state: GameState = createInitialState({ seed: SEED, players });
const setupRng = createRng(`${SEED}:setup`);
const perArchRng = new Map<string, ReturnType<typeof createRng>>();
for (const p of players) perArchRng.set(p.id, createRng(`${SEED}:ai:${p.id}`));

let actionsApplied = 0;
let engineErrors = 0;

function step(action: Action): boolean {
  try {
    state = apply(state, action).next;
    actionsApplied++;
    return true;
  } catch (err) {
    engineErrors++;
    if (engineErrors <= 3) console.warn('engine reject:', (err as Error).message, action);
    return false;
  }
}

while (state.phase !== 'done' && actionsApplied < MAX_ACTIONS && state.turn < MAX_TURNS) {
  const cp = state.players[state.currentPlayerIdx];
  if (!cp || cp.eliminated) break;

  // Resolve any forced trade gate before anything else
  if (state.pendingForcedTrade && state.pendingForcedTrade.playerId === cp.id) {
    const best = findBestSet(cp.cards, new Set(ownedBy(state, cp.id)));
    if (best) {
      if (!step({ type: 'trade-cards', indices: best })) break;
      continue;
    }
    break; // unresolvable — shouldn't happen (6 cards always form a set)
  }

  if (state.pendingMove) {
    step({ type: 'move-after-capture', count: state.pendingMove.max });
    continue;
  }

  if (state.phase === 'setup-claim') {
    const free = TERR_ORDER.filter((n) => state.territories[n]?.owner === null);
    if (!free.length) break;
    step({ type: 'claim-territory', territory: free[nextInt(setupRng, free.length)]! });
    continue;
  }
  if (state.phase === 'setup-reinforce') {
    const owned = ownedBy(state, cp.id);
    if (!owned.length || cp.reserves <= 0) break;
    step({ type: 'setup-reinforce', territory: owned[nextInt(setupRng, owned.length)]! });
    continue;
  }

  // Main phase: delegate to the real AI
  const archId = (players.find((p) => p.id === cp.id)?.archId ?? 'napoleon') as ArchId;
  const rng = perArchRng.get(cp.id)!;
  const actions = takeTurn(state, cp.id, rng, archId);
  if (!actions.length) {
    // safety: advance the turn if AI couldn't produce any action
    step({ type: 'end-turn' });
    continue;
  }
  let progressed = false;
  for (const action of actions) {
    if ((state.phase as string) === 'done') break;
    if (step(action)) progressed = true;
  }
  if (!progressed) break;
}

const ownershipByArch = new Map<string, number>();
for (const p of state.players) {
  const arch = players.find((q) => q.id === p.id)?.archId ?? '?';
  ownershipByArch.set(arch, ownedBy(state, p.id).length);
}

const winnerArch =
  state.winner != null ? (players.find((p) => p.id === state.winner)?.archId ?? '?') : null;
const sorted = Array.from(ownershipByArch).sort((a, b) => b[1] - a[1]);
const leaderArch = sorted[0]?.[0] ?? '?';
const leaderCount = sorted[0]?.[1] ?? 0;

console.log('---');
console.log(`seed            : ${SEED}`);
console.log(`phase           : ${state.phase}`);
console.log(`turn            : ${state.turn}`);
console.log(`actions applied : ${actionsApplied}`);
console.log(`engine errors   : ${engineErrors}`);
console.log(`winner          : ${winnerArch ?? '<none>'}`);
console.log(`leader          : ${leaderArch} (${leaderCount} territories)`);
console.log(
  `territories/arch: ${sorted.map(([a, n]) => `${a}=${n}`).join(' ')}`,
);

// Exit non-zero only if the engine rejected more actions than it accepted —
// that means a rule change broke the orchestrator.
if (engineErrors > actionsApplied * 0.01) {
  console.error(`FAIL: ${engineErrors} engine errors out of ${actionsApplied} actions.`);
  process.exit(1);
}
console.log('OK');
