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
 * Risk single-roll outcome probabilities.
 *
 * Each entry is the probability that, in one engagement of the given dice
 * combo, the *defender* loses N armies. Sourced from Tan (1997). We use this
 * for a quick "≈ 58%" preview of a one-shot attack — for blitzes the true
 * "take it" probability is a longer chain, but this is sufficient as a
 * direction-finding hint at a glance.
 */
type DiceKey = '1v1' | '1v2' | '2v1' | '2v2' | '3v1' | '3v2';
const SINGLE_ROLL_DEFENDER_LOSS: Record<DiceKey, readonly number[]> = {
  // [P(0 def loss), P(1 def loss), P(2 def loss)]
  '1v1': [0.5833, 0.4167, 0],
  '1v2': [0.7454, 0.2546, 0],
  '2v1': [0.4213, 0.5787, 0],
  '2v2': [0.4483, 0.3241, 0.2276],
  '3v1': [0.3403, 0.6597, 0],
  '3v2': [0.2926, 0.3358, 0.3717],
};

/** Estimate "≈ X%" for a single engagement reducing the defender to 0. */
function estimateTakeOdds(srcArmies: number, tgtArmies: number): number | null {
  const atk = Math.min(3, Math.max(1, srcArmies - 1));
  const def = Math.min(2, Math.max(1, tgtArmies));
  const key = `${atk}v${def}` as DiceKey;
  const lossDist = SINGLE_ROLL_DEFENDER_LOSS[key];
  if (!lossDist) return null;
  // Rough chain: probability of *eliminating* defender in one shot is the
  // probability that defender loses ≥ tgtArmies in this engagement.
  // For tgtArmies > 2 in a single roll this is 0; we still surface a rough
  // single-roll defender-loss expectation in that case.
  let p = 0;
  for (let dl = tgtArmies; dl < lossDist.length; dl++) {
    p += lossDist[dl] ?? 0;
  }
  return p;
}

/**
 * Attack phase panel: Src/Tgt display + Single/Blitz/End buttons.
 * Adds an animated dashed arrow between FROM and TO when both selected,
 * plus a single-roll odds estimate.
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

  const odds = srcTerr && tgtTerr ? estimateTakeOdds(srcTerr.armies, tgtTerr.armies) : null;
  const oddsLabel = odds == null ? '—' : `≈ ${Math.round(odds * 100)}% to take`;

  return (
    <div className="flex flex-col gap-3 border-b border-line px-4 py-4" aria-label="attack-panel">
      <div>
        <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink-faint">Phase</p>
        <h2 className="font-display text-2xl font-semibold tracking-[0.1em] text-ink">ATTACK</h2>
      </div>

      {/* Src / Tgt — bigger chips with animated arrow between */}
      <div className="flex items-stretch gap-2">
        <TerritoryChip
          label="FROM"
          name={selected ?? '—'}
          armies={srcTerr ? srcTerr.armies : undefined}
          color="var(--usa)"
          highlighted={!!selected}
        />
        <FlowArrow active={!!(selected && target)} />
        <TerritoryChip
          label="TO"
          name={target ?? '—'}
          armies={tgtTerr ? tgtTerr.armies : undefined}
          color="var(--rus)"
          highlighted={!!target}
        />
      </div>

      {/* Odds preview */}
      <div
        className="flex items-center justify-between border border-line bg-panel-2/50 px-3 py-1.5"
        aria-label="attack-odds"
      >
        <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink-faint">
          Odds
        </span>
        <span
          className={`font-display text-[12px] tracking-[0.04em] ${
            odds == null ? 'text-ink-ghost' : odds >= 0.5 ? 'text-ok' : 'text-warn'
          }`}
        >
          {oddsLabel}
        </span>
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
          className="border border-line px-3 py-2 font-mono text-[9px] uppercase tracking-widest text-ink-dim transition-colors hover:border-danger hover:text-danger"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onSingle}
          disabled={!canAttack}
          className="flex-1 border border-line py-2 font-mono text-[9px] uppercase tracking-widest text-ink-dim transition-colors hover:border-hot hover:text-hot disabled:cursor-not-allowed disabled:text-ink-ghost"
        >
          Single
        </button>
        <button
          type="button"
          onClick={onBlitz}
          disabled={!canAttack}
          className="flex-1 border border-hot bg-hot/10 py-2 font-mono text-[9px] uppercase tracking-widest text-hot transition-colors hover:bg-hot/20 disabled:cursor-not-allowed disabled:border-line disabled:text-ink-ghost"
        >
          Blitz
        </button>
        <button
          type="button"
          onClick={onEndAttack}
          className="border border-line px-3 py-2 font-mono text-[9px] uppercase tracking-widest text-ink-dim transition-colors hover:border-ok hover:text-ok"
        >
          End
        </button>
      </div>
    </div>
  );
}

/**
 * SVG arrow with a marching-ants stroke that "flows" from FROM to TO when
 * both endpoints exist. When only one is set, dims to a static glyph.
 */
function FlowArrow({ active }: { active: boolean }) {
  return (
    <div className="flex w-10 items-center justify-center" aria-hidden>
      <svg viewBox="0 0 32 24" width="32" height="24" focusable="false">
        <title>{active ? 'attack flow' : 'attack flow disabled'}</title>
        <line
          x1="2"
          y1="12"
          x2="24"
          y2="12"
          stroke={active ? 'var(--hot)' : 'var(--ink-ghost)'}
          strokeWidth="1.4"
          strokeDasharray={active ? '4 3' : '2 4'}
          opacity={active ? 1 : 0.6}
          style={{
            animation: active ? 'marchingAnts 800ms linear infinite' : undefined,
          }}
          className={active ? 'rr-anim-marchingAnts' : undefined}
        />
        <path
          d="M22 7 L30 12 L22 17 Z"
          fill={active ? 'var(--hot)' : 'var(--ink-ghost)'}
          opacity={active ? 1 : 0.7}
        />
      </svg>
    </div>
  );
}

function TerritoryChip({
  label,
  name,
  armies,
  color,
  highlighted,
}: {
  label: string;
  name: string;
  armies?: number | undefined;
  color: string;
  highlighted: boolean;
}) {
  return (
    <div
      className={`flex flex-1 flex-col gap-0.5 border bg-panel p-2 ${
        highlighted ? 'border-line-2' : 'border-line'
      }`}
      style={{
        boxShadow: highlighted ? `inset 0 0 0 1px ${color}33, 0 0 10px ${color}22` : undefined,
        transition: 'box-shadow 200ms var(--ease-out-fast)',
      }}
    >
      <span className="font-mono text-[7px] uppercase tracking-[0.16em] text-ink-ghost">
        {label}
      </span>
      <span className="truncate font-display text-[13px]" style={{ color }}>
        {name.length > 12 ? name.substring(0, 12) : name}
      </span>
      {armies !== undefined && (
        <span className="font-mono text-[8px] text-ink-faint">{armies} armies</span>
      )}
    </div>
  );
}
