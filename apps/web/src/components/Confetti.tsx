import { useMemo } from 'react';
import { useReducedMotion } from '../hooks/useReducedMotion';

interface ConfettiProps {
  /** How many particles to emit. Kept small — purely decorative. */
  count?: number;
  /** Seed for deterministic particle placement (for test snapshots, etc.). */
  seed?: number;
}

interface Particle {
  readonly left: number; // 0-100 (%)
  readonly delay: number; // ms
  readonly duration: number; // ms
  readonly drift: number; // px, horizontal travel
  readonly color: string;
  readonly size: number; // px
  readonly shape: 'sq' | 'rect';
}

const PALETTE = ['var(--hot)', 'var(--ok)', 'var(--warn)', 'var(--usa)', 'var(--chn)'];

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * CSS-only confetti burst. Respects prefers-reduced-motion (renders nothing).
 * Pointer-events disabled so it never eats clicks on the modal beneath.
 */
export function Confetti({ count = 42, seed = 1337 }: ConfettiProps) {
  const reduced = useReducedMotion();
  const particles = useMemo<Particle[]>(() => {
    const rand = mulberry32(seed);
    const list: Particle[] = [];
    for (let i = 0; i < count; i++) {
      list.push({
        left: rand() * 100,
        delay: rand() * 400,
        duration: 1400 + rand() * 1200,
        drift: (rand() - 0.5) * 260,
        color: PALETTE[Math.floor(rand() * PALETTE.length)] ?? 'var(--hot)',
        size: 4 + rand() * 4,
        shape: rand() > 0.5 ? 'sq' : 'rect',
      });
    }
    return list;
  }, [count, seed]);

  if (reduced) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={{ zIndex: 0 }}
    >
      {particles.map((p, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: deterministic particle order
          key={i}
          className="rr-anim-confettiFall absolute block"
          style={{
            top: -20,
            left: `${p.left}%`,
            width: p.shape === 'sq' ? p.size : p.size * 1.6,
            height: p.size,
            background: p.color,
            opacity: 0,
            animation: `confettiFall ${p.duration}ms ${p.delay}ms var(--ease-out-fast) forwards`,
            ['--confetti-x' as string]: `${p.drift}px`,
          }}
        />
      ))}
    </div>
  );
}
