import type { GameState, TerritoryName } from '@riskrask/engine';

interface StageHudProps {
  state: GameState;
  hover: TerritoryName | null;
}

/**
 * Four corner overlays on the stage:
 * - TL: theatre (continent of hovered territory)
 * - TR: coordinates (x/y of hovered territory)
 * - BL: legend (faction diamonds, inline, matches command-console mockup)
 * - BR: selected-callout (moved to SelectedOverlay on the SVG)
 */
export function StageHud({ state, hover }: StageHudProps) {
  const hoverTerr = hover ? state.territories[hover] : null;

  const activePlayers = state.players.filter((p) => !p.eliminated && !p.isNeutral);

  return (
    <>
      {/* Top-left: Theatre */}
      <div className="pointer-events-none absolute left-3 top-3 z-10 border border-line bg-bg-0/80 px-3 py-1.5">
        <p className="font-mono text-[8px] uppercase tracking-[0.16em] text-ink-ghost">Theatre</p>
        <p className="font-display text-[11px] text-ink-faint">
          {hoverTerr ? hoverTerr.continent : '—'}
        </p>
      </div>

      {/* Top-right: Coordinates */}
      <div className="pointer-events-none absolute right-3 top-3 z-10 border border-line bg-bg-0/80 px-3 py-1.5">
        <p className="font-mono text-[8px] uppercase tracking-[0.16em] text-ink-ghost">Coords</p>
        <p className="font-mono text-[10px] text-ink-faint">
          {hoverTerr ? `${hoverTerr.x}, ${hoverTerr.y}` : '— , —'}
        </p>
      </div>

      {/* Bottom-left: Legend — inline row with "// LEGEND" header */}
      <div className="pointer-events-none absolute bottom-4 left-4 z-10 flex flex-col gap-1.5">
        <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-ink-faint">
          {'// LEGEND'}
        </p>
        <div className="flex items-center gap-5">
          {activePlayers.map((p) => (
            <div key={p.id} className="flex items-center gap-2">
              <LegendDiamond color={p.color} />
              <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-ink-dim">
                {p.name}
              </span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function LegendDiamond({ color }: { color: string }) {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <path d="M 5 0.5 L 9.5 5 L 5 9.5 L 0.5 5 Z" fill="none" stroke={color} strokeWidth="1.2" />
    </svg>
  );
}
