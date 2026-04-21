import type { GameState, TerritoryName } from '@riskrask/engine';
import { canFortify } from '@riskrask/engine';
import { useEffect, useRef, useState } from 'react';

interface FortifyPanelProps {
  state: GameState;
  /** playerId of the human player (needed for canFortify check) */
  humanPlayerId: string;
  selected: TerritoryName | null;
  target: TerritoryName | null;
  onConfirm: (count: number) => void;
  onSkip: () => void;
}

/**
 * Fortify phase: Src/Tgt + army slider + Confirm/Skip pair.
 * Slider readout bumps on change; min/half/max chips for one-tap presets.
 */
export function FortifyPanel({
  state,
  humanPlayerId: _humanPlayerId,
  selected,
  target,
  onConfirm,
  onSkip,
}: FortifyPanelProps) {
  const srcTerr = selected ? state.territories[selected] : null;
  const maxMove = srcTerr ? srcTerr.armies - 1 : 0;
  const [count, setCount] = useState(1);

  // Reset count when source changes / max shrinks.
  useEffect(() => {
    setCount((c) => Math.min(Math.max(1, c), Math.max(1, maxMove)));
  }, [maxMove]);

  const canDo =
    selected &&
    target &&
    srcTerr &&
    maxMove >= 1 &&
    canFortify(state, selected, target, _humanPlayerId);

  const half = Math.max(1, Math.round(maxMove / 2));
  const [bump, setBump] = useState(0);
  const lastRef = useRef(count);
  useEffect(() => {
    if (lastRef.current !== count) {
      lastRef.current = count;
      setBump((b) => b + 1);
    }
  }, [count]);

  return (
    <div className="flex flex-col gap-3 border-b border-line px-4 py-4" aria-label="fortify-panel">
      <div>
        <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink-faint">Phase</p>
        <h2 className="font-display text-2xl font-semibold tracking-[0.1em] text-ink">FORTIFY</h2>
      </div>

      <div className="flex items-center gap-2">
        <span className="w-10 font-mono text-[9px] text-ink-faint">FROM</span>
        <span className="font-display text-sm text-ink">{selected ?? '—'}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="w-10 font-mono text-[9px] text-ink-faint">TO</span>
        <span className="font-display text-sm text-ink">{target ?? '—'}</span>
      </div>

      {canDo && (
        <>
          {/* Big bump readout */}
          <div className="flex items-baseline justify-between border border-hot/40 bg-hot/5 px-3 py-2">
            <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-hot/80">
              MOVE
            </span>
            <span
              key={bump}
              className="font-display text-2xl font-semibold tracking-[0.04em] text-hot"
              style={{
                animation: 'scaleIn 120ms var(--ease-bounce)',
                textShadow: '0 0 14px rgba(255,77,46,0.5)',
              }}
            >
              {count}
            </span>
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[9px] text-ink-faint">
                {count}/{maxMove}
              </span>
              <span className="font-mono text-[9px] text-ink-ghost">max {maxMove}</span>
            </div>
            <input
              type="range"
              min={1}
              max={maxMove}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              className="w-full accent-hot"
              aria-label="fortify-count"
            />
            <div className="flex gap-1.5">
              <Chip label="MIN" onClick={() => setCount(1)} active={count === 1} />
              <Chip label="HALF" onClick={() => setCount(half)} active={count === half} />
              <Chip label="MAX" onClick={() => setCount(maxMove)} active={count === maxMove} />
            </div>
          </div>
        </>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onSkip}
          className="flex-1 border border-line py-2 font-mono text-[10px] uppercase tracking-widest text-ink-dim transition-colors hover:border-line-2 hover:text-ink"
        >
          Skip
        </button>
        <button
          type="button"
          onClick={() => onConfirm(count)}
          disabled={!canDo}
          className="flex-1 border border-hot bg-hot/10 py-2 font-mono text-[10px] uppercase tracking-widest text-hot transition-colors hover:bg-hot/20 disabled:cursor-not-allowed disabled:border-line disabled:text-ink-ghost"
        >
          Confirm
        </button>
      </div>
    </div>
  );
}

function Chip({
  label,
  onClick,
  active,
}: {
  label: string;
  onClick: () => void;
  active: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 border py-1 font-mono text-[9px] uppercase tracking-widest transition-colors ${
        active
          ? 'border-hot bg-hot/10 text-hot'
          : 'border-line text-ink-dim hover:border-hot hover:text-hot'
      }`}
    >
      {label}
    </button>
  );
}
