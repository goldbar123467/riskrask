import { useMemo } from 'react';
import { CONTINENTS, PALETTE, TERRITORIES } from '@riskrask/engine';
import type { GameState, TerritoryName } from '@riskrask/engine';
import { AdjacencyLines } from './AdjacencyLines';
import { ContinentLabel } from './ContinentLabel';
import { Node } from './Node';
import { SelectedOverlay } from './SelectedOverlay';

interface MapProps {
  state: GameState;
  humanPlayerId: string;
  selected: TerritoryName | null;
  target: TerritoryName | null;
  onSelect: (name: TerritoryName) => void;
  onHover: (name: TerritoryName | null) => void;
}

const NEUTRAL_COLOR = 'rgba(140,155,175,0.4)';

function ownerColor(
  state: GameState,
  terrName: TerritoryName,
  playerColors: Record<string, string>,
): string {
  const owner = state.territories[terrName]?.owner;
  if (!owner) return NEUTRAL_COLOR;
  return playerColors[owner] ?? PALETTE[0]?.color ?? NEUTRAL_COLOR;
}

/** Reverse-lookup: territory name → human-readable continent name. */
const CONTINENT_BY_TERRITORY: Readonly<Record<string, string>> = (() => {
  const map: Record<string, string> = {};
  for (const cont of Object.values(CONTINENTS)) {
    for (const member of cont.members) {
      map[member] = cont.name;
    }
  }
  return Object.freeze(map);
})();

/**
 * SVG root (viewBox 0 0 1000 640): lat/long grid + continents + edges + nodes.
 * Uses territory positions from the engine's TERRITORIES constant.
 * Selection is managed by the parent (Play.tsx) and passed down.
 */
export function GameMap({ state, humanPlayerId, selected, target, onSelect, onHover }: MapProps) {
  // Stable per-players player-id → color map. Rebuilding every render broke
  // React.memo on <Node>; memoizing here keeps the reference steady until a
  // player is added, removed, or re-coloured.
  const playerColors = useMemo(() => {
    const m: Record<string, string> = {};
    for (const p of state.players) m[p.id] = p.color;
    return m;
  }, [state.players]);

  const isTargetable = (name: TerritoryName): boolean => {
    if (!selected || state.phase !== 'attack') return false;
    const terr = state.territories[name];
    if (!terr || terr.owner === humanPlayerId) return false;
    return state.territories[selected]?.adj.includes(name) ?? false;
  };

  return (
    <svg
      viewBox="0 0 1000 640"
      width="100%"
      height="100%"
      style={{ display: 'block' }}
      aria-label="game-map"
      role="img"
    >
      <title>Game Map</title>
      {/* Lat/long grid */}
      <g aria-label="grid" opacity="0.04">
        {Array.from({ length: 13 }, (_, i) => i * 53).map((y) => (
          <line
            key={`h${y}`}
            x1="0"
            y1={y}
            x2="1000"
            y2={y}
            stroke="rgba(80,100,140,1)"
            strokeWidth="1"
          />
        ))}
        {Array.from({ length: 13 }, (_, i) => i * 83).map((x) => (
          <line
            key={`v${x}`}
            x1={x}
            y1="0"
            x2={x}
            y2="640"
            stroke="rgba(80,100,140,1)"
            strokeWidth="1"
          />
        ))}
      </g>

      {/* Continent background fills */}
      {Object.entries(CONTINENTS).map(([key, cont]) => (
        <ContinentLabel key={key} id={key} continent={cont} />
      ))}

      {/* Adjacency lines */}
      <AdjacencyLines territories={state.territories} />

      {/* Territory nodes */}
      {Object.entries(state.territories).map(([name, terr]) => {
        const tname = name as TerritoryName;
        const oColor = ownerColor(state, tname, playerColors);
        return (
          <Node
            key={name}
            name={tname}
            territory={terr}
            ownerColor={oColor}
            owned={terr.owner === humanPlayerId}
            selected={selected === tname}
            targetable={isTargetable(tname)}
            continent={CONTINENT_BY_TERRITORY[tname] ?? 'Unknown'}
            onSelect={onSelect}
            onHover={onHover}
          />
        );
      })}

      {/* Selected territory overlay */}
      {selected && <SelectedOverlay selected={selected} target={target} state={state} />}
    </svg>
  );
}

// Re-export as Map for callers that import { Map }
export { GameMap as Map, TERRITORIES };
