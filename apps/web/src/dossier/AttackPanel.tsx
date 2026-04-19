import type { GameState, TerritoryName } from '@riskrask/engine';

interface AttackPanelProps {
  state: GameState;
  humanPlayerId: string;
  selected: TerritoryName | null;
  target: TerritoryName | null;
  onSingle: () => void;
  onBlitz: () => void;
  onEndAttack: () => void;
  onCancel: () => void;
}

/**
 * Attack phase panel: Src/Tgt display + Single/Blitz/End buttons.
 */
export function AttackPanel({
  state,
  humanPlayerId: _humanPlayerId,
  selected,
  target,
  onSingle,
  onBlitz,
  onEndAttack,
  onCancel,
}: AttackPanelProps) {
  const srcTerr = selected ? state.territories[selected] : null;
  const tgtTerr = target ? state.territories[target] : null;
  const canAttack = !!(selected && target && srcTerr && srcTerr.armies >= 2);

  return (
    <div className="flex flex-col gap-3 border-b border-line px-4 py-4" aria-label="attack-panel">
      <div>
        <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink-faint">Phase</p>
        <h2 className="font-display text-2xl font-semibold tracking-[0.1em] text-ink">ATTACK</h2>
      </div>

      {/* Src / Tgt */}
      <div className="flex items-center gap-2">
        <TerritoryChip
          label="FROM"
          name={selected ?? '—'}
          armies={srcTerr ? srcTerr.armies : undefined}
          color="var(--usa)"
        />
        <span className="font-mono text-[10px] text-hot">→</span>
        <TerritoryChip
          label="TO"
          name={target ?? '—'}
          armies={tgtTerr ? tgtTerr.armies : undefined}
          color="var(--rus)"
        />
      </div>

      <p className="font-mono text-[10px] text-ink-faint">
        {!selected
          ? 'Select an owned territory to attack from'
          : !target
            ? 'Select an adjacent enemy territory'
            : `Ready to attack ${target}`}
      </p>

      {/* Action buttons */}
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={onCancel}
          className="border border-line px-3 py-2 font-mono text-[9px] uppercase tracking-widest text-ink-dim hover:border-danger hover:text-danger"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onSingle}
          disabled={!canAttack}
          className="flex-1 border border-line py-2 font-mono text-[9px] uppercase tracking-widest text-ink-dim hover:border-hot hover:text-hot disabled:cursor-not-allowed disabled:text-ink-ghost"
        >
          Single
        </button>
        <button
          type="button"
          onClick={onBlitz}
          disabled={!canAttack}
          className="flex-1 border border-hot bg-hot/10 py-2 font-mono text-[9px] uppercase tracking-widest text-hot hover:bg-hot/20 disabled:cursor-not-allowed disabled:border-line disabled:text-ink-ghost"
        >
          Blitz
        </button>
        <button
          type="button"
          onClick={onEndAttack}
          className="border border-line px-3 py-2 font-mono text-[9px] uppercase tracking-widest text-ink-dim hover:border-ok hover:text-ok"
        >
          End
        </button>
      </div>
    </div>
  );
}

function TerritoryChip({
  label,
  name,
  armies,
  color,
}: {
  label: string;
  name: string;
  armies?: number | undefined;
  color: string;
}) {
  return (
    <div className="flex flex-1 flex-col gap-0.5 border border-line bg-panel p-2">
      <span className="font-mono text-[7px] uppercase tracking-[0.16em] text-ink-ghost">
        {label}
      </span>
      <span className="truncate font-display text-[11px] text-ink" style={{ color }}>
        {name.length > 12 ? name.substring(0, 12) : name}
      </span>
      {armies !== undefined && (
        <span className="font-mono text-[8px] text-ink-faint">{armies} armies</span>
      )}
    </div>
  );
}
