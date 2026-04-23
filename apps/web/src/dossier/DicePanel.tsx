import { useEffect, useRef, useState } from 'react';

interface DicePanelProps {
  attackDice: readonly number[];
  defenseDice: readonly number[];
}

interface Outcome {
  /** Net attacker losses (defender losses minus attacker losses, signed). */
  delta: number;
  /** WIN if attacker took fewer losses than defender; LOSS if more; PUSH if even. */
  kind: 'WIN' | 'LOSS' | 'PUSH';
  attackerLosses: number;
  defenderLosses: number;
}

/**
 * Pair the highest attacker die against the highest defender die, and the
 * second-highest pair if both have one. Defender wins ties — classic Risk.
 */
function computeOutcome(
  attackDice: readonly number[],
  defenseDice: readonly number[],
): Outcome | null {
  if (attackDice.length === 0 || defenseDice.length === 0) return null;
  const atk = [...attackDice].sort((a, b) => b - a);
  const def = [...defenseDice].sort((a, b) => b - a);
  const pairs = Math.min(atk.length, def.length);
  let attackerLosses = 0;
  let defenderLosses = 0;
  for (let i = 0; i < pairs; i++) {
    const a = atk[i] ?? 0;
    const d = def[i] ?? 0;
    if (a > d) defenderLosses++;
    else attackerLosses++;
  }
  const delta = defenderLosses - attackerLosses;
  const kind: Outcome['kind'] = delta > 0 ? 'WIN' : delta < 0 ? 'LOSS' : 'PUSH';
  return { delta, kind, attackerLosses, defenderLosses };
}

/**
 * 3×2 dice grid: attacker above (red), defender below (grey).
 * Tumble on roll, then a settled glow pulse on the resulting value.
 *
 * A small outcome banner flashes "WIN +N" / "LOSS −N" beneath the grid
 * for ~1s after each new roll arrives.
 */
export function DicePanel({ attackDice, defenseDice }: DicePanelProps) {
  const [shaking, setShaking] = useState(false);
  const [flashKey, setFlashKey] = useState<number>(0);
  const [showBanner, setShowBanner] = useState(false);
  const prevRef = useRef<string>('');

  const key = `${attackDice.join(',')}|${defenseDice.join(',')}`;
  const outcome = computeOutcome(attackDice, defenseDice);

  useEffect(() => {
    if (key !== prevRef.current && (attackDice.length > 0 || defenseDice.length > 0)) {
      prevRef.current = key;
      setShaking(true);
      setShowBanner(true);
      setFlashKey((k) => k + 1);
      const t1 = setTimeout(() => setShaking(false), 900);
      // Banner stays visible for ~1s after the dice settle.
      const t2 = setTimeout(() => setShowBanner(false), 1900);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }
  }, [key, attackDice.length, defenseDice.length]);

  if (attackDice.length === 0 && defenseDice.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 border-b border-line px-4 py-3" aria-label="dice-panel">
      <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-ink-faint">Last Roll</p>
      <div className="flex flex-col gap-1.5">
        {/* Attacker row */}
        <div className="flex items-center gap-1.5">
          <span className="w-14 font-mono text-[8px] text-danger">ATK</span>
          <div className="flex gap-1.5">
            {[0, 1, 2].map((i) => (
              <Die
                key={i}
                value={attackDice[i]}
                color="var(--danger)"
                glow="rgba(239, 68, 68, 0.65)"
                shake={shaking}
                delay={i * 80}
              />
            ))}
          </div>
        </div>
        {/* Defender row */}
        <div className="flex items-center gap-1.5">
          <span className="w-14 font-mono text-[8px] text-ink-dim">DEF</span>
          <div className="flex gap-1.5">
            {[0, 1].map((i) => (
              <Die
                key={i}
                value={defenseDice[i]}
                color="var(--ink-dim)"
                glow="rgba(200, 215, 235, 0.55)"
                shake={shaking}
                delay={i * 80 + 40}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Outcome banner — flashes after each new roll */}
      <OutcomeBanner outcome={outcome} visible={showBanner} flashKey={flashKey} />
    </div>
  );
}

function OutcomeBanner({
  outcome,
  visible,
  flashKey,
}: {
  outcome: Outcome | null;
  visible: boolean;
  flashKey: number;
}) {
  if (!outcome || !visible) return null;
  const { kind, delta } = outcome;
  const isWin = kind === 'WIN';
  const isLoss = kind === 'LOSS';
  const sign = delta > 0 ? '+' : delta < 0 ? '−' : '±';
  const colorVar = isWin ? 'var(--ok)' : isLoss ? 'var(--danger)' : 'var(--ink-dim)';
  return (
    <output
      key={flashKey}
      aria-label="dice-outcome"
      className="rr-anim-fadeInUp mt-1 flex items-center justify-center border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.18em]"
      style={{
        color: colorVar,
        borderColor: colorVar,
        background: `${isWin ? 'rgba(95,179,138,0.08)' : isLoss ? 'rgba(201,74,74,0.08)' : 'rgba(138,148,165,0.06)'}`,
        animation: 'fadeInUp 220ms var(--ease-out-fast)',
        boxShadow: isWin
          ? '0 0 10px rgba(95,179,138,0.25)'
          : isLoss
            ? '0 0 10px rgba(201,74,74,0.25)'
            : undefined,
      }}
    >
      {kind} {sign}
      {Math.abs(delta)}
    </output>
  );
}

function Die({
  value,
  color,
  glow,
  shake,
  delay,
}: {
  value: number | undefined;
  color: string;
  glow: string;
  shake: boolean;
  delay: number;
}) {
  const hasValue = value !== undefined;
  // While rolling: tumble. Once settled: slow glow pulse on the face.
  const animation = hasValue
    ? shake
      ? `die-tumble 900ms cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms both`
      : 'die-glow 2200ms ease-in-out infinite'
    : 'none';
  return (
    <div
      className="flex h-8 w-8 items-center justify-center border font-display text-sm font-semibold"
      style={{
        borderColor: hasValue ? color : 'var(--line)',
        color: hasValue ? color : 'var(--ink-ghost)',
        background: hasValue
          ? `radial-gradient(circle at 30% 25%, ${glow} 0%, transparent 70%), ${color}1f`
          : 'transparent',
        animation,
        ['--die-glow' as string]: glow,
        willChange: 'transform',
        transformOrigin: '50% 60%',
      }}
    >
      {hasValue ? <DiePips value={value} color={color} /> : <span>—</span>}
    </div>
  );
}

// Classic 3x3 die-face pip layout. Returns the list of pip centres (0..2 on each axis)
// for the given face value (1..6).
function pipsFor(value: number): ReadonlyArray<readonly [number, number]> {
  switch (value) {
    case 1:
      return [[1, 1]];
    case 2:
      return [
        [0, 0],
        [2, 2],
      ];
    case 3:
      return [
        [0, 0],
        [1, 1],
        [2, 2],
      ];
    case 4:
      return [
        [0, 0],
        [2, 0],
        [0, 2],
        [2, 2],
      ];
    case 5:
      return [
        [0, 0],
        [2, 0],
        [1, 1],
        [0, 2],
        [2, 2],
      ];
    case 6:
      return [
        [0, 0],
        [2, 0],
        [0, 1],
        [2, 1],
        [0, 2],
        [2, 2],
      ];
    default:
      return [];
  }
}

function DiePips({ value, color }: { value: number; color: string }) {
  const pips = pipsFor(value);
  // Pip coords are on a 3x3 grid; map to SVG positions in a 24x24 viewBox with
  // 6px inset so pips never touch the border.
  const inset = 6;
  const step = (24 - inset * 2) / 2;
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      aria-label={`die-${value}`}
      role="img"
      focusable="false"
    >
      {pips.map(([cx, cy], idx) => (
        <circle
          // biome-ignore lint/suspicious/noArrayIndexKey: pip order is stable per value
          key={idx}
          cx={inset + cx * step}
          cy={inset + cy * step}
          r={2}
          fill={color}
        />
      ))}
    </svg>
  );
}
