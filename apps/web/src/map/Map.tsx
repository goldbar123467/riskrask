import { CONTINENTS, PALETTE, TERRITORIES } from '@riskrask/engine';
import type { GameState, TerritoryName } from '@riskrask/engine';
import { AdjacencyLines } from './AdjacencyLines';
import { ContinentLabel } from './ContinentLabel';
import { Node } from './Node';
import { SelectedOverlay } from './SelectedOverlay';
import { WorldLayer } from './WorldLayer';

interface MapProps {
  state: GameState;
  humanPlayerId: string;
  selected: TerritoryName | null;
  target: TerritoryName | null;
  onSelect: (name: TerritoryName) => void;
  onHover: (name: TerritoryName | null) => void;
}

const NEUTRAL_COLOR = 'rgba(140,155,175,0.4)';

function ownerColor(state: GameState, terrName: TerritoryName, playerColors: Record<string, string>): string {
  const owner = state.territories[terrName]?.owner;
  if (!owner) return NEUTRAL_COLOR;
  return playerColors[owner] ?? PALETTE[0]?.color ?? NEUTRAL_COLOR;
}

/**
 * SVG root (viewBox 0 0 1000 640): world.svg + lat/long grid + continents + edges + nodes.
 * Uses territory positions from the engine's TERRITORIES constant.
 * Selection is managed by the parent (Play.tsx) and passed down.
 */
export function Map({ state, humanPlayerId, selected, target, onSelect, onHover }: MapProps) {
  // Build a stable player-id → color map
  const playerColors: Record<string, string> = {};
  for (const p of state.players) {
    playerColors[p.id] = p.color;
  }

  const isClickable = (name: TerritoryName): boolean => {
    const terr = state.territories[name];
    if (!terr) return false;

    if (state.phase === 'setup-claim') return terr.owner === null;
    if (state.phase === 'setup-reinforce') return terr.owner === humanPlayerId;

    const cp = state.players[state.currentPlayerIdx];
    if (!cp || cp.id !== humanPlayerId) return false;

    if (state.phase === 'reinforce') return terr.owner === humanPlayerId;
    if (state.phase === 'attack') {
      if (terr.owner === humanPlayerId && terr.armies >= 2) return true;
      if (selected && terr.owner !== humanPlayerId && terr.owner !== null) {
        return state.territories[selected]?.adj.includes(name) ?? false;
      }
      return false;
    }
    if (state.phase === 'fortify') return terr.owner === humanPlayerId;
    return false;
  };

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
    >
      {/* Lat/long grid */}
      <g aria-label="grid" opacity="0.04">
        {Array.from({ length: 13 }, (_, i) => (
          <line
            key={`h${i}`}
            x1="0"
            y1={i * 53}
            x2="1000"
            y2={i * 53}
            stroke="rgba(80,100,140,1)"
            strokeWidth="1"
          />
        ))}
        {Array.from({ length: 13 }, (_, i) => (
          <line
            key={`v${i}`}
            x1={i * 83}
            y1="0"
            x2={i * 83}
            y2="640"
            stroke="rgba(80,100,140,1)"
            strokeWidth="1"
          />
        ))}
      </g>

      {/* World landmass */}
      <WorldLayer />

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
            onSelect={onSelect}
            onHover={onHover}
          />
        );
      })}

      {/* Selected territory overlay */}
      {selected && (
        <SelectedOverlay
          selected={selected}
          target={target}
          state={state}
        />
      )}
    </svg>
  );
}

export { TERRITORIES };
