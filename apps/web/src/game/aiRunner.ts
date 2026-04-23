import { Arch, takeSetupAction, takeTurn } from '@riskrask/ai';
import type { Action, GameState, PlayerId } from '@riskrask/engine';
import { createRng, nextInt } from '@riskrask/engine';

/**
 * Deterministically assign an archetype to a player based on seed + id, so
 * a given game always features the same opponents regardless of turn.
 * Dilettante is excluded — it's the historical random-noise baseline.
 */
const ASSIGNABLE_ARCHS = Arch.ids.filter((id) => id !== 'dilettante');

function archForPlayer(seed: string, playerId: PlayerId): string {
  const rng = createRng(`${seed}:arch:${playerId}`);
  return ASSIGNABLE_ARCHS[nextInt(rng, ASSIGNABLE_ARCHS.length)] ?? 'napoleon';
}

/**
 * Generate the next batch of actions for an AI player.
 *
 * Setup phases delegate to `takeSetupAction` so solo and MP (server fallback)
 * share a single source of truth. Main-game phases delegate to `takeTurn`
 * for the scored archetype AI.
 */
export function dilettanteTurn(state: GameState, playerId: PlayerId): Action[] {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return [];

  // Resolve pending move first (can happen in any state when attacker captured)
  if (state.pendingMove) {
    return [{ type: 'move-after-capture', count: state.pendingMove.min }];
  }

  if (state.phase === 'setup-claim' || state.phase === 'setup-reinforce') {
    const rng = createRng(`${state.seed}:ai:${playerId}:${state.turn}:${state.rngCursor}`);
    return takeSetupAction(state, playerId, rng);
  }

  if (state.phase === 'done') return [];

  // Main-game phases: delegate to the scored archetype AI.
  const rng = createRng(`${state.seed}:ai:${playerId}:${state.turn}:${state.rngCursor}`);
  const archId = archForPlayer(state.seed, playerId);
  return takeTurn(state, playerId, rng, archId);
}
