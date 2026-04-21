import type { PendingMove } from '@riskrask/engine';
import { motion } from 'framer-motion';
import { useState } from 'react';
import { useReducedMotion } from '../hooks/useReducedMotion';

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
  const reduced = useReducedMotion();

  const half = Math.max(min, Math.min(max, Math.round((min + max) / 2)));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <motion.dialog
        className="flex w-[380px] flex-col gap-5 border border-line bg-bg-0 p-7"
        aria-label="move-modal"
        open
        initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: reduced ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
        style={{ boxShadow: '0 0 32px rgba(0,0,0,0.65)' }}
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
            <span className="font-mono text-[10px] text-ink-faint">
              Move: <span className="font-display text-sm text-hot">{count}</span>
            </span>
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
          <div className="mt-1 flex gap-1.5">
            <Chip label="MIN" onClick={() => setCount(min)} active={count === min} />
            <Chip label="HALF" onClick={() => setCount(half)} active={count === half} />
            <Chip label="MAX" onClick={() => setCount(max)} active={count === max} />
          </div>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 border border-line py-2 font-mono text-[10px] uppercase tracking-widest text-ink-dim transition-colors hover:border-danger hover:text-danger"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(count)}
            className="flex-1 border border-hot bg-hot/10 py-2 font-mono text-[10px] uppercase tracking-widest text-hot transition-colors hover:bg-hot/20"
          >
            Confirm
          </button>
        </div>
      </motion.dialog>
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
