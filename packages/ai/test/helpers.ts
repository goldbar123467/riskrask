/**
 * Test helpers — build a mid-game GameState with territories pre-assigned.
 */
import { apply, createInitialState, createRng, playerId } from '@riskrask/engine';
import type { GameState, PlayerId } from '@riskrask/engine';
import { TERR_ORDER } from '@riskrask/engine';

export const P0 = playerId('p0');
export const P1 = playerId('p1');
export const P2 = playerId('p2');
export const P3 = playerId('p3');

const BASE_PLAYERS = [
  { id: P0, name: 'Alpha', color: '#c0392b', isAI: true },
  { id: P1, name: 'Beta', color: '#2563eb', isAI: true },
  { id: P2, name: 'Gamma', color: '#059669', isAI: true },
  { id: P3, name: 'Delta', color: '#f59e0b', isAI: true },
];

/**
 * Build a GameState in reinforce phase where territories are distributed
 * round-robin among players. Each player owns ~10 territories with 3 armies each.
 */
export function buildMidgameState(seed = 'test-seed'): GameState {
  // Start from setup and run through claim + setup-reinforce programmatically
  let state = createInitialState({ seed, players: BASE_PLAYERS });

  // Claim all 42 territories in round-robin order
  const territoryNames = TERR_ORDER.slice();
  for (const territory of territoryNames) {
    const action = { type: 'claim-territory' as const, territory };
    const result = apply(state, action);
    state = result.next;
  }

  // Setup reinforce: each player places all reserves
  let maxIter = 200;
  while (state.phase === 'setup-reinforce' && maxIter-- > 0) {
    const cp = state.players[state.currentPlayerIdx];
    if (!cp || cp.reserves <= 0) break;
    // Place on first owned territory with at least 1 army
    const owned = Object.entries(state.territories)
      .filter(([, t]) => t.owner === cp.id)
      .map(([name]) => name);
    const target = owned[0];
    if (!target) break;
    const result = apply(state, { type: 'setup-reinforce', territory: target });
    state = result.next;
  }

  return state;
}

/** Get the current player's id. */
export function currentPlayerId(state: GameState): PlayerId {
  const p = state.players[state.currentPlayerIdx];
  if (!p) throw new Error('No current player');
  return p.id;
}
