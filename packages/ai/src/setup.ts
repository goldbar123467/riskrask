import type { Action, GameState, PlayerId, Rng } from '@riskrask/engine';
import { ADJACENCY, TERR_ORDER, nextInt } from '@riskrask/engine';

/**
 * AI decision for a single setup-phase action (setup-claim or setup-reinforce).
 * Returns a single-action batch or [] when no legal action exists.
 *
 * This is intentionally narrow in scope — the main-game orchestrator
 * (takeTurn) covers reinforce/attack/fortify. Setup is driven one action
 * at a time by the reducer's round-robin logic; we just pick one territory.
 *
 * Policy:
 *  - setup-claim: prefer unowned territories adjacent to territories we
 *    already own (cluster for continent bonuses). Fallback to random
 *    unowned. Random among top-tier candidates for determinism + variety.
 *  - setup-reinforce: prefer owned territories with ≥1 enemy neighbour
 *    (reinforce borders). Fallback to random owned.
 */
export function takeSetupAction(state: GameState, playerId: PlayerId, rng: Rng): Action[] {
  if (state.phase === 'setup-claim') {
    return setupClaim(state, playerId, rng);
  }
  if (state.phase === 'setup-reinforce') {
    return setupReinforce(state, playerId, rng);
  }
  return [];
}

function setupClaim(state: GameState, playerId: PlayerId, rng: Rng): Action[] {
  const unowned = TERR_ORDER.filter((n) => state.territories[n]?.owner === null);
  if (unowned.length === 0) return [];

  // Prefer unowned territories adjacent to ones we already hold.
  const ownedSet = new Set(TERR_ORDER.filter((n) => state.territories[n]?.owner === playerId));
  const adjacentToOwn = unowned.filter((n) =>
    (ADJACENCY[n] ?? []).some((adj) => ownedSet.has(adj)),
  );
  const pool = adjacentToOwn.length > 0 ? adjacentToOwn : unowned;
  const pick = pool[nextInt(rng, pool.length)];
  return pick ? [{ type: 'claim-territory', territory: pick }] : [];
}

function setupReinforce(state: GameState, playerId: PlayerId, rng: Rng): Action[] {
  const player = state.players.find((p) => p.id === playerId);
  if (!player || player.reserves <= 0) return [];

  const owned = TERR_ORDER.filter((n) => state.territories[n]?.owner === playerId);
  if (owned.length === 0) return [];

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
