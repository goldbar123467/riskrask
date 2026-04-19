import type { PendingMove } from '@riskrask/engine';
import { useState } from 'react';

interface MoveModalProps {
  pendingMove: PendingMove;
  onConfirm: (count: number) => void;
  onCancel: () => void;
}

/**
 * Post-capture move-armies picker.
 * Slider range: [min = atkDiceRolled, max = src.armies - 1].
 * Always shown as Cancel + Confirm pair.
 */
export function MoveModal({ pendingMove, onConfirm, onCancel }: MoveModalProps) {
  const { source, target, min, max } = pendingMove;
  const [count, setCount] = useState(min);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <dialog
        className="flex w-[380px] flex-col gap-5 border border-line bg-bg-0 p-7"
        aria-label="move-modal"
        open
      >
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink-faint">
            Capture: Move Armies
          </p>
          <h2 className="font-display text-xl text-ink">
            {source} → {target}
          </h2>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] text-ink-faint">Move: {count}</span>
            <span className="font-mono text-[9px] text-ink-ghost">
              {min} min / {max} max
            </span>
          </div>
          <input
            type="range"
            min={min}
            max={max}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            className="w-full accent-hot"
          />
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 border border-line py-2 font-mono text-[10px] uppercase tracking-widest text-ink-dim hover:border-danger hover:text-danger"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(count)}
            className="flex-1 border border-hot bg-hot/10 py-2 font-mono text-[10px] uppercase tracking-widest text-hot hover:bg-hot/20"
          >
            Confirm
          </button>
        </div>
      </dialog>
    </div>
  );
}
