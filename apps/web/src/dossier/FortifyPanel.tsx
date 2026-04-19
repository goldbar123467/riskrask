import type { GameState, TerritoryName } from '@riskrask/engine';
import { canFortify } from '@riskrask/engine';
import { useState } from 'react';

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

  const canDo =
    selected &&
    target &&
    srcTerr &&
    maxMove >= 1 &&
    canFortify(state, selected, target, _humanPlayerId);

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
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[9px] text-ink-faint">ARMIES: {count}</span>
            <span className="font-mono text-[9px] text-ink-ghost">max {maxMove}</span>
          </div>
          <input
            type="range"
            min={1}
            max={maxMove}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            className="w-full accent-hot"
          />
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={onSkip}
          className="flex-1 border border-line py-2 font-mono text-[10px] uppercase tracking-widest text-ink-dim hover:border-line-2 hover:text-ink"
        >
          Skip
        </button>
        <button
          onClick={() => onConfirm(count)}
          disabled={!canDo}
          className="flex-1 border border-hot bg-hot/10 py-2 font-mono text-[10px] uppercase tracking-widest text-hot hover:bg-hot/20 disabled:cursor-not-allowed disabled:border-line disabled:text-ink-ghost"
        >
          Confirm
        </button>
      </div>
    </div>
  );
}
