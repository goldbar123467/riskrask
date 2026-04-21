import type { ContinentDef } from '@riskrask/engine';

interface ContinentLabelProps {
  id: string;
  continent: ContinentDef;
}

/**
 * Per-continent title with glow filter (feGaussianBlur + feMerge) and bonus tspan.
 */
export function ContinentLabel({ id, continent }: ContinentLabelProps) {
  const filterId = `glow-${id}`;
  return (
    <g aria-label={`continent-${id}`}>
      <defs>
        <filter id={filterId} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {/*
        Contrast bumped 2026-04-20 after the world-map background layer was
        removed — against the darker stage these needed more weight to stay
        legible. Previously 0.25 / 0.15, which was fine *over* the world fill.
      */}
      <text
        x={continent.labelX}
        y={continent.labelY}
        textAnchor="middle"
        style={{ filter: `url(#${filterId})` }}
        fill="rgba(232,236,242,0.45)"
        fontSize="11"
        fontFamily="'Space Grotesk', system-ui, sans-serif"
        fontWeight="500"
        letterSpacing="0.18em"
      >
        {continent.name.toUpperCase()}
        <tspan
          dy="13"
          x={continent.labelX}
          fontSize="9"
          fill="rgba(232,236,242,0.3)"
          letterSpacing="0.12em"
        >
          +{continent.bonus}
        </tspan>
      </text>
    </g>
  );
}
