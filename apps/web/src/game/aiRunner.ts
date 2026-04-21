import { Arch, takeTurn } from '@riskrask/ai';
import type { Action, GameState, PlayerId } from '@riskrask/engine';
import { ADJACENCY, TERR_ORDER, createRng, nextInt } from '@riskrask/engine';

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
 * Setup phases are handled inline — `@riskrask/ai.takeTurn` only covers the
 * main three-phase turn (reinforce → attack → fortify), so we keep a
 * lightweight claimer for setup-claim / setup-reinforce here.
 */
export function dilettanteTurn(state: GameState, playerId: PlayerId): Action[] {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return [];

  // Resolve pending move first (can happen in any state when attacker captured)
  if (state.pendingMove) {
    return [{ type: 'move-after-capture', count: state.pendingMove.min }];
  }

  // Setup phases: pure random placement (classic Risk setup is strategic but
  // we intentionally keep AI behaviour light here — the main game uses the
  // scored AI below).
  if (state.phase === 'setup-claim') {
    const rng = createRng(`${state.seed}:ai:${playerId}:${state.turn}:${state.rngCursor}`);
    const unclaimed = TERR_ORDER.filter((n) => state.territories[n]?.owner === null);
    if (unclaimed.length === 0) return [];
    const pick = unclaimed[nextInt(rng, unclaimed.length)];
    return pick ? [{ type: 'claim-territory', territory: pick }] : [];
  }

  if (state.phase === 'setup-reinforce') {
    const rng = createRng(`${state.seed}:ai:${playerId}:${state.turn}:${state.rngCursor}`);
    const owned = TERR_ORDER.filter((n) => state.territories[n]?.owner === playerId);
    if (owned.length === 0 || player.reserves <= 0) return [];

    // Prefer owned territories with at least one enemy neighbour (classic
    // strategy: reinforce borders first). Fallback to a random owned tile.
    const borders = owned.filter((n) =>
      (ADJACENCY[n] ?? []).some((adj) => {
        const t = state.territories[adj];
        return t && t.owner !== null && t.owner !== playerId;
      }),
    );
    const pool = borders.length > 0 ? borders : owned;
    const pick = pool[nextInt(rng, pool.length)];
    return pick ? [{ type: 'setup-reinforce', territory: pick }] : [];
  }

  if (state.phase === 'done') return [];

  // Main-game phases: delegate to the scored archetype AI.
  const rng = createRng(`${state.seed}:ai:${playerId}:${state.turn}:${state.rngCursor}`);
  const archId = archForPlayer(state.seed, playerId);
  return takeTurn(state, playerId, rng, archId);
}
