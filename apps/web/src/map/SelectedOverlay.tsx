import type { GameState, TerritoryName } from '@riskrask/engine';

interface SelectedOverlayProps {
  selected: TerritoryName;
  target: TerritoryName | null;
  state: GameState;
}

/**
 * Crosshair ring + callout annotation for the selected territory.
 */
export function SelectedOverlay({ selected, target: _target, state }: SelectedOverlayProps) {
  const terr = state.territories[selected];
  if (!terr) return null;

  const { x, y } = terr;
  const owner = state.players.find((p) => p.id === terr.owner);

  const actionHint =
    state.phase === 'attack'
      ? 'ATTACK'
      : state.phase === 'fortify'
        ? 'FORTIFY'
        : state.phase === 'reinforce'
          ? 'DEPLOY'
          : '';

  return (
    <g aria-label="selected-overlay" pointerEvents="none">
      {/* Crosshair ring */}
      <circle
        cx={x}
        cy={y}
        r={20}
        fill="none"
        stroke="var(--hot)"
        strokeWidth="1"
        strokeDasharray="4 4"
        opacity="0.8"
      />
      {/* Cross lines */}
      <line x1={x - 26} y1={y} x2={x - 22} y2={y} stroke="var(--hot)" strokeWidth="1" opacity="0.6" />
      <line x1={x + 22} y1={y} x2={x + 26} y2={y} stroke="var(--hot)" strokeWidth="1" opacity="0.6" />
      <line x1={x} y1={y - 26} x2={x} y2={y - 22} stroke="var(--hot)" strokeWidth="1" opacity="0.6" />
      <line x1={x} y1={y + 22} x2={x} y2={y + 26} stroke="var(--hot)" strokeWidth="1" opacity="0.6" />

      {/* Callout annotation */}
      <g transform={`translate(${x + 28}, ${y - 22})`}>
        <rect x="0" y="0" width="100" height="40" fill="rgba(7,8,9,0.85)" stroke="var(--hot)" strokeWidth="0.5" />
        <text x="5" y="12" fontSize="7" fill="var(--hot)" fontFamily="'JetBrains Mono',monospace" fontWeight="600">
          ▸ {selected.length > 14 ? selected.substring(0, 14) : selected}
        </text>
        <text x="5" y="24" fontSize="6" fill="rgba(140,155,175,0.8)" fontFamily="'JetBrains Mono',monospace">
          {owner ? `${owner.name.substring(0, 8)}` : 'NEUTRAL'} · {terr.armies}
        </text>
        {actionHint && (
          <text x="5" y="34" fontSize="6" fill="rgba(255,77,46,0.7)" fontFamily="'JetBrains Mono',monospace">
            → {actionHint}
          </text>
        )}
      </g>
    </g>
  );
}
