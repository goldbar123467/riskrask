import { ADJ_PAIRS, EDGE_EXIT_PAIRS, TERRITORIES } from '@riskrask/engine';
import type { GameState, TerritoryName } from '@riskrask/engine';

interface AdjacencyLinesProps {
  territories: GameState['territories'];
}

const SEA_THRESHOLD = 260;
const MAP_WIDTH = 1000;

function euclidean(ax: number, ay: number, bx: number, by: number): number {
  return Math.sqrt((bx - ax) ** 2 + (by - ay) ** 2);
}

const edgeExitSet = new Set(EDGE_EXIT_PAIRS.map(([a, b]) => [a, b].sort().join('|')));

const SEA_STROKE = 'rgba(80,140,220,0.5)';
const LAND_STROKE = 'rgba(150,170,200,0.3)';

/**
 * Renders dashed adjacency edges. Long edges (>260 euclidean) get the `sea` style.
 * Edge-exit pairs (trans-pacific) render as two stubs going off each side of the
 * map rather than a single line drawn straight across.
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

        if (isEdgeExit) {
          // Pick the territory on the left vs right of the map and draw each
          // as a short stub continuing off its nearest horizontal edge, as if
          // wrapping around a globe.
          const left = ta.x <= tb.x ? ta : tb;
          const right = ta.x <= tb.x ? tb : ta;
          return (
            <g key={key}>
              <line
                x1={left.x}
                y1={left.y}
                x2={0}
                y2={left.y}
                stroke={SEA_STROKE}
                strokeWidth={1}
                strokeDasharray="4 5"
              />
              <line
                x1={right.x}
                y1={right.y}
                x2={MAP_WIDTH}
                y2={right.y}
                stroke={SEA_STROKE}
                strokeWidth={1}
                strokeDasharray="4 5"
              />
            </g>
          );
        }

        const dist = euclidean(ta.x, ta.y, tb.x, tb.y);
        const isSea = dist > SEA_THRESHOLD;

        return (
          <line
            key={key}
            x1={ta.x}
            y1={ta.y}
            x2={tb.x}
            y2={tb.y}
            stroke={isSea ? SEA_STROKE : LAND_STROKE}
            strokeWidth={isSea ? 1 : 0.8}
            strokeDasharray={isSea ? '4 5' : '2 4'}
          />
        );
      })}
    </g>
  );
}
