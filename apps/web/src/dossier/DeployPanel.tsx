import type { GameState, TerritoryName } from '@riskrask/engine';

interface DeployPanelProps {
  state: GameState;
  humanPlayerId: string;
  selected: TerritoryName | null;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * DEPLOY phase hero: big headline + readouts + Confirm/Cancel pair.
 * Shown when phase === reinforce (placement step).
 */
export function DeployPanel({
  state,
  humanPlayerId,
  selected,
  onConfirm,
  onCancel,
}: DeployPanelProps) {
  const player = state.players.find((p) => p.id === humanPlayerId);
  const reserves = player?.reserves ?? 0;
  const selectedTerr = selected ? state.territories[selected] : null;

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

      {/* Progress bar */}
      <div className="h-1 w-full overflow-hidden bg-panel-2">
        <div
          className="h-full bg-hot transition-all duration-300"
          style={{ width: reserves > 0 ? `${Math.min(100, (reserves / 10) * 100)}%` : '0%' }}
        />
      </div>

      <p className="font-mono text-[10px] text-ink-faint">
        {selected
          ? `Click CONFIRM to place all ${reserves} armies on ${selected}`
          : 'Select a territory to deploy armies'}
      </p>

      {/* Confirm / Cancel pair */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 border border-line py-2 font-mono text-[10px] uppercase tracking-widest text-ink-dim hover:border-danger hover:text-danger"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={!selected || reserves <= 0}
          className="flex-1 border border-hot bg-hot/10 py-2 font-mono text-[10px] uppercase tracking-widest text-hot hover:bg-hot/20 disabled:cursor-not-allowed disabled:border-line disabled:text-ink-ghost"
        >
          Confirm
        </button>
      </div>
    </div>
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
