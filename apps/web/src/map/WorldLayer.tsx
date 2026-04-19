import { useMemo } from 'react';
// Vite raw import — world.svg as a string
import rawSvg from '/assets/world.svg?raw';

interface Paths {
  outline: string;
  boundaries: string;
}

function extractPaths(svg: string): Paths {
  const outlineMatch = svg.match(/id="outline"[^>]*\s+d="([^"]+)"/);
  const boundMatch = svg.match(/id="boundaries"[^>]*\s+d="([^"]+)"/);

  // Fallback: grab the first and second path elements if IDs not found
  const allPaths = [...svg.matchAll(/<path[^>]+d="([^"]+)"/g)];

  return {
    outline: outlineMatch?.[1] ?? allPaths[0]?.[1] ?? '',
    boundaries: boundMatch?.[1] ?? allPaths[1]?.[1] ?? '',
  };
}

let _cached: Paths | null = null;

function getCachedPaths(): Paths {
  if (!_cached) _cached = extractPaths(rawSvg);
  return _cached;
}

/**
 * Renders the world outline and continent boundary paths extracted from world.svg.
 * z-order: outline first (fill), boundaries on top (stroke only).
 */
export function WorldLayer() {
  const { outline, boundaries } = useMemo(() => getCachedPaths(), []);

  return (
    <g aria-label="world-layer">
      {outline && (
        <path
          d={outline}
          fill="#0e131a"
          stroke="rgba(150,170,200,0.22)"
          strokeWidth="0.8"
        />
      )}
      {boundaries && (
        <path
          d={boundaries}
          fill="none"
          stroke="rgba(150,170,200,0.10)"
          strokeWidth="0.5"
          strokeDasharray="3 4"
        />
      )}
    </g>
  );
}
