import type { GameState, TerritoryName } from '@riskrask/engine';
import { useEffect, useRef, useState } from 'react';

interface DeployPanelProps {
  state: GameState;
  humanPlayerId: string;
  selected: TerritoryName | null;
  count: number;
  onCountChange: (count: number) => void;
  onConfirm: (count: number) => void;
  onCancel: () => void;
}

/**
 * DEPLOY phase hero: pick a count (1..reserves) and confirm.
 * Slider + -1/+1/MAX quick buttons so placing a single troop is as easy as all.
 */
export function DeployPanel({
  state,
  humanPlayerId,
  selected,
  count,
  onCountChange,
  onConfirm,
  onCancel,
}: DeployPanelProps) {
  const player = state.players.find((p) => p.id === humanPlayerId);
  const reserves = player?.reserves ?? 0;
  const selectedTerr = selected ? state.territories[selected] : null;

  // Keep the controlled count within [1, reserves] as reserves change.
  useEffect(() => {
    if (reserves <= 0) {
      if (count !== 1) onCountChange(1);
      return;
    }
    const clamped = Math.min(Math.max(1, count), reserves);
    if (clamped !== count) onCountChange(clamped);
  }, [reserves, count, onCountChange]);

  const canDeploy = Boolean(selected) && reserves > 0;
  const effectiveCount = Math.min(Math.max(1, count), Math.max(1, reserves));

  // "Bump" the readout briefly each time count changes.
  const [bump, setBump] = useState(0);
  const lastCountRef = useRef(effectiveCount);
  useEffect(() => {
    if (lastCountRef.current !== effectiveCount) {
      lastCountRef.current = effectiveCount;
      setBump((b) => b + 1);
    }
  }, [effectiveCount]);

  const fillPct = reserves > 0 ? Math.min(100, (effectiveCount / reserves) * 100) : 0;

  return (
    <div className="flex flex-col gap-3 border-b border-line px-4 py-4" aria-label="deploy-panel">
      {/* Phase headline */}
      <div>
        <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink-faint">Phase</p>
        <h2 className="font-display text-2xl font-semibold tracking-[0.1em] text-ink">DEPLOY</h2>
      </div>

      {/* Readouts */}
      <div className="flex gap-4">
        <Readout label="RESERVES" value={String(reserves)} hot={reserves > 0} />
        <Readout
          label="TARGET"
          value={selected ? (selected.length > 10 ? selected.substring(0, 10) : selected) : '—'}
        />
        {selectedTerr && <Readout label="ARMIES" value={String(selectedTerr.armies)} />}
      </div>

      {/* Big "PLACE: N" readout — bumps on change */}
      {canDeploy && (
        <div className="flex items-baseline justify-between border border-hot/40 bg-hot/5 px-3 py-2">
          <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-hot/80">
            PLACE
          </span>
          <span
            key={bump}
            className="font-display text-2xl font-semibold tracking-[0.04em] text-hot"
            style={{
              animation: 'scaleIn 120ms var(--ease-bounce)',
              textShadow: '0 0 14px rgba(255,77,46,0.5)',
            }}
          >
            {effectiveCount}
          </span>
        </div>
      )}

      {/* Progress bar — fills to count/reserves. Decorative; the slider above
          is the real input and announces its value via aria-label. */}
      <div className="h-1 w-full overflow-hidden bg-panel-2" aria-hidden>
        <div
          className="h-full bg-hot"
          style={{
            width: `${fillPct}%`,
            transition: 'width 220ms var(--ease-out-fast)',
            boxShadow: '0 0 8px var(--hot-glow)',
          }}
        />
      </div>

      {/* Quantity selector */}
      {canDeploy && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[9px] text-ink-faint">
              {effectiveCount}/{reserves}
            </span>
            <span className="font-mono text-[9px] text-ink-ghost">max {reserves}</span>
          </div>
          <input
            type="range"
            min={1}
            max={reserves}
            value={effectiveCount}
            onChange={(e) => onCountChange(Number(e.target.value))}
            className="w-full accent-hot"
            aria-label="deploy-count"
          />
          <div className="flex gap-1.5">
            <QuickBtn label="-1" onClick={() => onCountChange(Math.max(1, effectiveCount - 1))} />
            <QuickBtn
              label="+1"
              onClick={() => onCountChange(Math.min(reserves, effectiveCount + 1))}
            />
            <QuickBtn label="MAX" onClick={() => onCountChange(reserves)} />
          </div>
        </div>
      )}

      <p className="font-mono text-[10px] text-ink-faint">
        {selected
          ? `Confirm to place ${effectiveCount} ${effectiveCount === 1 ? 'army' : 'armies'} on ${selected}`
          : 'Select a territory to deploy armies'}
      </p>

      {/* Confirm / Cancel pair */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 border border-line py-2 font-mono text-[10px] uppercase tracking-widest text-ink-dim transition-colors hover:border-danger hover:text-danger"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onConfirm(effectiveCount)}
          disabled={!canDeploy}
          className="flex-1 border border-hot bg-hot/10 py-2 font-mono text-[10px] uppercase tracking-widest text-hot transition-colors hover:bg-hot/20 disabled:cursor-not-allowed disabled:border-line disabled:text-ink-ghost"
        >
          Confirm
        </button>
      </div>
    </div>
  );
}

function QuickBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-1 border border-line py-1 font-mono text-[9px] uppercase tracking-widest text-ink-dim transition-colors hover:border-hot hover:text-hot"
    >
      {label}
    </button>
  );
}

function Readout({ label, value, hot }: { label: string; value: string; hot?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-mono text-[8px] uppercase tracking-[0.16em] text-ink-ghost">
        {label}
      </span>
      <span className={`font-display text-sm ${hot ? 'text-hot' : 'text-ink'}`}>{value}</span>
    </div>
  );
}
