import { useEffect, useRef, useState } from 'react';

interface DicePanelProps {
  attackDice: readonly number[];
  defenseDice: readonly number[];
}

/**
 * 3×2 dice grid: attacker above (red), defender below (grey).
 * 600ms shake animation, then static for 1.2s.
 */
export function DicePanel({ attackDice, defenseDice }: DicePanelProps) {
  const [shaking, setShaking] = useState(false);
  const prevRef = useRef<string>('');

  const key = JSON.stringify({ attackDice, defenseDice });

  useEffect(() => {
    if (key !== prevRef.current && (attackDice.length > 0 || defenseDice.length > 0)) {
      prevRef.current = key;
      setShaking(true);
      const t = setTimeout(() => setShaking(false), 600);
      return () => clearTimeout(t);
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
          <div className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <Die
                key={i}
                value={attackDice[i]}
                color="var(--danger)"
                shake={shaking}
                delay={i * 50}
              />
            ))}
          </div>
        </div>
        {/* Defender row */}
        <div className="flex items-center gap-1.5">
          <span className="w-14 font-mono text-[8px] text-ink-dim">DEF</span>
          <div className="flex gap-1">
            {[0, 1].map((i) => (
              <Die
                key={i}
                value={defenseDice[i]}
                color="var(--ink-dim)"
                shake={shaking}
                delay={i * 50 + 30}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Die({
  value,
  color,
  shake,
  delay,
}: {
  value: number | undefined;
  color: string;
  shake: boolean;
  delay: number;
}) {
  return (
    <div
      className="flex h-7 w-7 items-center justify-center border font-display text-sm font-semibold transition-all"
      style={{
        borderColor: value !== undefined ? color : 'var(--line)',
        color: value !== undefined ? color : 'var(--ink-ghost)',
        background: value !== undefined ? `${color}11` : 'transparent',
        animation: shake && value !== undefined ? `shake 600ms ease-out ${delay}ms` : 'none',
      }}
    >
      {value !== undefined ? <DiePips value={value} color={color} /> : <span>—</span>}
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
