import { ADJ_PAIRS, EDGE_EXIT_PAIRS, TERRITORIES } from '@riskrask/engine';
import type { GameState, TerritoryName } from '@riskrask/engine';

interface AdjacencyLinesProps {
  territories: GameState['territories'];
}

const SEA_THRESHOLD = 260;

function euclidean(ax: number, ay: number, bx: number, by: number): number {
  return Math.sqrt((bx - ax) ** 2 + (by - ay) ** 2);
}

const edgeExitSet = new Set(EDGE_EXIT_PAIRS.map(([a, b]) => [a, b].sort().join('|')));

/**
 * Renders dashed adjacency edges. Long edges (>260 euclidean) get the `sea` style.
 * Edge-exit pairs (trans-pacific) use a special dashed style.
 */
export function AdjacencyLines({ territories }: AdjacencyLinesProps) {
  return (
    <g aria-label="adjacency-lines" opacity="0.45">
      {ADJ_PAIRS.map(([a, b]) => {
        const ta = territories[a as TerritoryName] ?? TERRITORIES[a as TerritoryName];
        const tb = territories[b as TerritoryName] ?? TERRITORIES[b as TerritoryName];
        if (!ta || !tb) return null;

        const key = [a, b].sort().join('|');
        const isEdgeExit = edgeExitSet.has(key);
        const dist = euclidean(ta.x, ta.y, tb.x, tb.y);
        const isSea = dist > SEA_THRESHOLD || isEdgeExit;

        return (
          <line
            key={key}
            x1={ta.x}
            y1={ta.y}
            x2={tb.x}
            y2={tb.y}
            stroke={isSea ? 'rgba(80,140,220,0.5)' : 'rgba(150,170,200,0.3)'}
            strokeWidth={isSea ? 1 : 0.8}
            strokeDasharray={isSea ? '4 5' : '2 4'}
          />
        );
      })}
    </g>
  );
}
