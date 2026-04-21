import type { ContinentDef } from '@riskrask/engine';

interface ContinentLabelProps {
  id: string;
  continent: ContinentDef;
}

/**
 * Continent title rendered at the top/bottom of its region with the bonus
 * stat inline to the right. Matches the command-console mockup: muted grey
 * uppercase name with wide tracking, plus a hot-accent "+N" token.
 */
export function ContinentLabel({ id, continent }: ContinentLabelProps) {
  const filterId = `glow-${id}`;
  const nameText = continent.name.toUpperCase();
  // Rough estimate so the "+N" sits to the right of the name, inline.
  const nameWidth = nameText.length * 8.4;
  const bonusX = continent.labelX + nameWidth / 2 + 18;

  return (
    <g aria-label={`continent-${id}`}>
      <defs>
        <filter id={filterId} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <text
        x={continent.labelX}
        y={continent.labelY}
        textAnchor="middle"
        style={{ filter: `url(#${filterId})` }}
        fill="rgba(180,190,210,0.28)"
        fontSize="13"
        fontFamily="'Space Grotesk', system-ui, sans-serif"
        fontWeight="500"
        letterSpacing="0.32em"
      >
        {nameText}
      </text>
      <text
        x={bonusX}
        y={continent.labelY}
        textAnchor="start"
        fill="var(--hot)"
        fontSize="10"
        fontFamily="'JetBrains Mono', monospace"
        fontWeight="500"
        letterSpacing="0.08em"
        opacity="0.85"
      >
        +{continent.bonus}
      </text>
    </g>
  );
}
