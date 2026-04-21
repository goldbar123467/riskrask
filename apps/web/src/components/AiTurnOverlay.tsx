import { AnimatePresence, motion } from 'framer-motion';
import { useReducedMotion } from '../hooks/useReducedMotion';

interface AiTurnOverlayProps {
  /** Render gate — the overlay only mounts when true. */
  active: boolean;
  /** Display name of the acting AI commander. */
  name: string;
  /** Optional faction color for the accent bar. */
  color?: string;
}

/**
 * Dim overlay shown while an AI commander is thinking. `pointer-events: none`
 * on the host so the map beneath still receives hover/zoom. Only the label
 * pill is visible; dim layer is subtle so the user can still watch the board.
 */
export function AiTurnOverlay({ active, name, color }: AiTurnOverlayProps) {
  const reduced = useReducedMotion();
  return (
    <AnimatePresence>
      {active && (
        <motion.div
          aria-label="ai-turn-overlay"
          className="pointer-events-none absolute inset-0 z-20 flex items-start justify-center pt-24"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduced ? 0 : 0.2 }}
        >
          {/* Dim scrim — map still shows through. */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{ background: 'rgba(5, 7, 10, 0.32)' }}
          />

          {/* Status pill */}
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: reduced ? 0 : 0.2, delay: reduced ? 0 : 0.05 }}
            className="pointer-events-none relative flex items-center gap-3 border border-line bg-bg-0/92 px-5 py-2 backdrop-blur-sm"
            style={{ boxShadow: '0 0 24px rgba(0,0,0,0.6)' }}
          >
            <span
              className="h-2 w-2 rotate-45"
              style={{
                background: color ?? 'var(--warn)',
                boxShadow: `0 0 10px ${color ?? 'var(--warn)'}`,
                animation: reduced ? undefined : 'pulseGlow 1400ms ease-in-out infinite',
              }}
            />
            <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-faint">
              AI TURN
            </span>
            <span className="font-display text-[13px] tracking-[0.12em] text-ink">— {name}</span>
            <span
              aria-hidden
              className="ml-1 flex gap-1 font-mono text-[10px] text-ink-faint"
              style={{ letterSpacing: '0.3em' }}
            >
              <Dot delay={0} reduced={reduced} />
              <Dot delay={180} reduced={reduced} />
              <Dot delay={360} reduced={reduced} />
            </span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Dot({ delay, reduced }: { delay: number; reduced: boolean }) {
  return (
    <span
      className="inline-block h-1 w-1 rounded-full"
      style={{
        background: 'var(--ink-dim)',
        animation: reduced ? undefined : `pulseGlow 900ms ${delay}ms ease-in-out infinite`,
      }}
    />
  );
}
