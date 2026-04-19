import type { Action, GameState, PlayerId } from '@riskrask/engine';
import {
  ADJACENCY,
  TERR_ORDER,
  createRng,
  nextInt,
} from '@riskrask/engine';

/**
 * Dilettante AI: picks a legal random action using the engine's RNG.
 *
 * TODO(Track F): swap dilettanteTurn for @riskrask/ai.takeTurn(state, playerId, rng)
 * once the AI package is merged.
 */
export function dilettanteTurn(state: GameState, playerId: PlayerId): Action[] {
  const rng = createRng(`${state.seed}:ai:${playerId}:${state.turn}:${state.rngCursor}`);

  const player = state.players.find((p) => p.id === playerId);
  if (!player) return [];

  const actions: Action[] = [];

  if (state.phase === 'setup-claim') {
    const unclaimed = TERR_ORDER.filter((n) => state.territories[n]?.owner === null);
    if (unclaimed.length > 0) {
      const pick = unclaimed[nextInt(rng, unclaimed.length)];
      if (pick) actions.push({ type: 'claim-territory', territory: pick });
    }
    return actions;
  }

  if (state.phase === 'setup-reinforce') {
    const owned = TERR_ORDER.filter((n) => state.territories[n]?.owner === playerId);
    if (owned.length > 0 && player.reserves > 0) {
      const pick = owned[nextInt(rng, owned.length)];
      if (pick) actions.push({ type: 'setup-reinforce', territory: pick });
    }
    return actions;
  }

  if (state.phase === 'reinforce') {
    const owned = TERR_ORDER.filter((n) => state.territories[n]?.owner === playerId);
    const reserves = player.reserves;
    if (owned.length > 0 && reserves > 0) {
      const pick = owned[nextInt(rng, owned.length)];
      if (pick) {
        actions.push({ type: 'reinforce', territory: pick, count: reserves });
      }
    }
    return actions;
  }

  if (state.phase === 'attack') {
    // Maybe attack once, then end
    const sources = TERR_ORDER.filter((n) => {
      const t = state.territories[n];
      return t?.owner === playerId && t.armies >= 2;
    });

    let attacked = false;
    if (sources.length > 0 && nextInt(rng, 2) === 1) {
      const src = sources[nextInt(rng, sources.length)];
      if (src) {
        const targets = (ADJACENCY[src] ?? []).filter((n) => {
          const t = state.territories[n];
          return t?.owner !== playerId && t?.owner !== null;
        });
        if (targets.length > 0) {
          const tgt = targets[nextInt(rng, targets.length)];
          if (tgt) {
            actions.push({ type: 'attack-blitz', from: src, to: tgt });
            attacked = true;
          }
        }
      }
    }

    void attacked;
    actions.push({ type: 'end-attack-phase' });
    return actions;
  }

  if (state.phase === 'fortify') {
    // Skip fortify, just end turn
    actions.push({ type: 'end-turn' });
    return actions;
  }

  return [{ type: 'end-turn' }];
}
