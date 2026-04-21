import type { GameState, TerritoryName } from '@riskrask/engine';

interface SelectedOverlayProps {
  selected: TerritoryName;
  target: TerritoryName | null;
  state: GameState;
}

const RING_R = 26;

/**
 * Hot-accent glow ring around the selected territory plus an inline callout
 * with headline / action / queue line. Matches the command-console mockup:
 * no bounding box, text floats next to the hex.
 */
export function SelectedOverlay({ selected, target: _target, state }: SelectedOverlayProps) {
  const terr = state.territories[selected];
  if (!terr) return null;

  const { x, y } = terr;

  const actionHint =
    state.phase === 'attack'
      ? 'STRIKE'
      : state.phase === 'fortify'
        ? 'FORTIFY'
        : state.phase === 'reinforce' || state.phase === 'setup-reinforce'
          ? 'DEPLOY'
          : state.phase === 'setup-claim'
            ? 'CLAIM'
            : '';

  // Current player's reserves gives a nice "+N" token next to the action.
  const cp = state.players[state.currentPlayerIdx];
  const reserves = cp?.reserves ?? 0;
  const reinforceToken =
    (state.phase === 'reinforce' || state.phase === 'setup-reinforce') && reserves > 0
      ? ` +${reserves}`
      : '';

  // Place the callout on the side of the map that has more room.
  const placeRight = x < 780;
  const calloutX = placeRight ? x + RING_R + 8 : x - RING_R - 8;
  const textAnchor = placeRight ? 'start' : 'end';

  const headline = selected.toUpperCase();
  const actionLine = actionHint ? `CONTROL TO ${actionHint}${reinforceToken}` : '';

  const glowId = `sel-glow-${selected.replace(/\s+/g, '-')}`;

  return (
    <g aria-label="selected-overlay" pointerEvents="none">
      <defs>
        <filter id={glowId} x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Outer soft glow */}
      <circle
        cx={x}
        cy={y}
        r={RING_R + 4}
        fill="none"
        stroke="var(--hot)"
        strokeWidth="0.8"
        opacity="0.28"
        style={{ filter: `url(#${glowId})` }}
      />
      {/* Solid ring */}
      <circle
        cx={x}
        cy={y}
        r={RING_R}
        fill="none"
        stroke="var(--hot)"
        strokeWidth="1.2"
        opacity="0.9"
      />

      {/* Callout text — no bounding box */}
      <g>
        <text
          x={calloutX}
          y={y - 4}
          textAnchor={textAnchor}
          fontSize="9"
          fontWeight="600"
          fill="var(--hot)"
          fontFamily="'JetBrains Mono', monospace"
          letterSpacing="0.1em"
        >
          {headline}
        </text>
        {actionLine && (
          <text
            x={calloutX}
            y={y + 6}
            textAnchor={textAnchor}
            fontSize="6.5"
            fill="var(--hot)"
            fontFamily="'JetBrains Mono', monospace"
            letterSpacing="0.12em"
            opacity="0.85"
          >
            {actionLine}
          </text>
        )}
        <text
          x={calloutX}
          y={y + 16}
          textAnchor={textAnchor}
          fontSize="6"
          fill="rgba(180,190,210,0.55)"
          fontFamily="'JetBrains Mono', monospace"
          letterSpacing="0.1em"
        >
          {placeRight ? '▸ ' : ''}BORDER CONFLICT QUEUE{!placeRight ? ' ◂' : ''}
        </text>
      </g>
    </g>
  );
}
