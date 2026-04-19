import type { GameState, TerritoryName } from '@riskrask/engine';

interface StageHudProps {
  state: GameState;
  hover: TerritoryName | null;
}

/**
 * Four corner overlays on the stage:
 * - TL: theatre (continent of hovered territory)
 * - TR: coordinates (x/y of hovered territory)
 * - BL: legend (faction colors)
 * - BR: selected-callout (moved to SelectedOverlay on the SVG)
 */
export function StageHud({ state, hover }: StageHudProps) {
  const hoverTerr = hover ? state.territories[hover] : null;

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

      {/* Bottom-left: Legend */}
      <div className="pointer-events-none absolute bottom-4 left-3 z-10 border border-line bg-bg-0/80 px-3 py-2">
        <p className="mb-1.5 font-mono text-[8px] uppercase tracking-[0.16em] text-ink-ghost">Legend</p>
        <div className="flex flex-col gap-1">
          {state.players.filter((p) => !p.eliminated).map((p) => (
            <div key={p.id} className="flex items-center gap-2">
              <div className="h-2 w-2 rotate-45" style={{ background: p.color }} />
              <span className="font-mono text-[8px] text-ink-faint">{p.name}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
