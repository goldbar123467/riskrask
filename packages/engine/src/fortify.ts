import { ADJACENCY } from './board';
import { EngineError } from './combat';
import type { Effect, GameState, PlayerId, TerritoryName } from './types';

/**
 * BFS to determine if srcName and tgtName are connected through territories
 * owned by playerId.
 */
export function connectedThroughOwned(
  state: GameState,
  srcName: TerritoryName,
  tgtName: TerritoryName,
  playerId: PlayerId,
): boolean {
  if (srcName === tgtName) return true;

  const src = state.territories[srcName];
  const tgt = state.territories[tgtName];
  if (!src || !tgt) return false;
  if (src.owner !== playerId || tgt.owner !== playerId) return false;

  const visited = new Set<TerritoryName>();
  const queue: TerritoryName[] = [srcName];
  visited.add(srcName);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const neighbors = ADJACENCY[current] ?? [];
    for (const neighbor of neighbors) {
      if (neighbor === tgtName) return true;
      if (!visited.has(neighbor)) {
        const neighborTerr = state.territories[neighbor];
        if (neighborTerr?.owner === playerId) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
  }

  return false;
}

/**
 * Returns true if a fortify move is legal. Common preconditions:
 *  - Both territories owned by playerId
 *  - src.armies > 1 (§4.3 — leave at least one behind)
 *  - src !== tgt
 *
 * Then the reach check is dispatched on `state.fortifyRule` (§4.3):
 *  - 'adjacent' (default, classic Hasbro 2008+) — src and tgt must share a
 *    direct land border or printed sea-lane.
 *  - 'connected' (house rule / Free Move) — there exists an unbroken chain of
 *    playerId-owned territories from src to tgt.
 *
 * Saves predating the flag have no `state.fortifyRule`; those fall back to
 * 'adjacent' so loaded games keep the current classic behaviour.
 */
export function canFortify(
  state: GameState,
  srcName: TerritoryName,
  tgtName: TerritoryName,
  playerId: PlayerId,
): boolean {
  if (srcName === tgtName) return false;
  const src = state.territories[srcName];
  const tgt = state.territories[tgtName];
  if (!src || !tgt) return false;
  if (src.owner !== playerId || tgt.owner !== playerId) return false;
  if (src.armies <= 1) return false;

  const rule = state.fortifyRule ?? 'adjacent';
  if (rule === 'connected') {
    return connectedThroughOwned(state, srcName, tgtName, playerId);
  }
  return (ADJACENCY[srcName] ?? []).includes(tgtName);
}

export interface FortifyResult {
  readonly next: GameState;
  readonly effects: Effect[];
}

/**
 * Move `count` armies from srcName to tgtName.
 * 1 ≤ count ≤ src.armies - 1
 */
export function doFortify(
  state: GameState,
  srcName: TerritoryName,
  tgtName: TerritoryName,
  count: number,
): FortifyResult {
  const cp = state.players[state.currentPlayerIdx];
  if (!cp) throw new EngineError('NO_CURRENT_PLAYER', 'No current player');

  const src = state.territories[srcName];
  const tgt = state.territories[tgtName];
  if (!src) throw new EngineError('INVALID_TERRITORY', `Unknown territory: ${srcName}`);
  if (!tgt) throw new EngineError('INVALID_TERRITORY', `Unknown territory: ${tgtName}`);

  if (src.owner !== cp.id) {
    throw new EngineError('NOT_OWNER', `Player does not own ${srcName}`);
  }
  if (tgt.owner !== cp.id) {
    throw new EngineError('NOT_OWNER', `Player does not own ${tgtName}`);
  }
  if (count < 1 || count >= src.armies) {
    throw new EngineError(
      'INVALID_COUNT',
      `Count must be between 1 and ${src.armies - 1}, got ${count}`,
    );
  }
  if (!canFortify(state, srcName, tgtName, cp.id)) {
    throw new EngineError('NOT_ADJACENT', `${srcName} is not adjacent to ${tgtName}`);
  }

  const newTerritories = { ...state.territories };
  newTerritories[srcName] = { ...src, armies: src.armies - count };
  newTerritories[tgtName] = { ...tgt, armies: tgt.armies + count };

  const effects: Effect[] = [
    { kind: 'log', text: `Fortified ${tgtName} with ${count} armies from ${srcName}.` },
  ];

  return {
    next: { ...state, territories: newTerritories },
    effects,
  };
}
