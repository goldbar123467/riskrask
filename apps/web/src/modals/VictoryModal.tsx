import type { GameState } from '@riskrask/engine';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Confetti } from '../components/Confetti';
import { useReducedMotion } from '../hooks/useReducedMotion';

interface VictoryModalProps {
  state: GameState;
  onRematch: () => void;
  /**
   * `solo` (default): Home + Rematch buttons. `room`: Home + "Back to lobby"
   * buttons — rematch in multiplayer is a host-triggered `launch_game` flow,
   * not a client-side reset. `roomId` is required when `mode === 'room'`.
   */
  mode?: 'solo' | 'room';
  roomId?: string;
}

/**
 * Victory modal: winner name + share code + Rematch button.
 * Always shows Cancel + Confirm button pair.
 */
export function VictoryModal({ state, onRematch, mode = 'solo', roomId }: VictoryModalProps) {
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const winner = state.players.find((p) => p.id === state.winner);

  if (!winner) return null;

  const standings = state.players
    .filter((p) => !p.eliminated || p.id === state.winner)
    .slice(0, 4)
    .map((p) => ({
      ...p,
      terrs: Object.values(state.territories).filter((t) => t.owner === p.id).length,
    }));

  const containerVariants = {
    hidden: {},
    show: {
      transition: { staggerChildren: reduced ? 0 : 0.06, delayChildren: reduced ? 0 : 0.18 },
    },
  };
  const childVariants = reduced
    ? {
        hidden: { opacity: 0 },
        show: { opacity: 1 },
      }
    : {
        hidden: { opacity: 0, y: 8 },
        show: { opacity: 1, y: 0, transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] } },
      };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <Confetti />
      <motion.dialog
        className="relative z-10 flex w-[400px] flex-col gap-5 border border-hot bg-bg-0 p-8"
        aria-label="victory-modal"
        open
        initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{
          duration: reduced ? 0 : 0.4,
          ease: reduced ? 'linear' : [0.34, 1.56, 0.64, 1],
        }}
        style={{ boxShadow: 'var(--shadow-hot-glow)' }}
      >
        {/* Header */}
        <motion.div
          className="flex flex-col items-center gap-2"
          variants={containerVariants}
          initial="hidden"
          animate="show"
        >
          <motion.div
            variants={childVariants}
            className="h-3 w-3 rotate-45"
            style={{ background: winner.color, boxShadow: `0 0 20px ${winner.color}` }}
          />
          <motion.h2
            variants={childVariants}
            className="font-display text-3xl font-bold tracking-[0.12em] text-hot"
            style={{ textShadow: '0 0 18px rgba(255,77,46,0.55)' }}
          >
            VICTORY
          </motion.h2>
          <motion.p variants={childVariants} className="font-display text-lg text-ink">
            {winner.name}
          </motion.p>
          <motion.p
            variants={childVariants}
            className="font-mono text-[9px] uppercase tracking-widest text-ink-faint"
          >
            Turn {state.turn} · {state.players.length} players
          </motion.p>
        </motion.div>

        {/* Stats — staggered children */}
        <motion.div
          className="flex justify-center gap-6 border-t border-b border-line py-4"
          variants={containerVariants}
          initial="hidden"
          animate="show"
        >
          {standings.map((p) => (
            <motion.div
              key={p.id}
              variants={childVariants}
              className="flex flex-col items-center gap-1"
            >
              <div className="h-2 w-2 rotate-45" style={{ background: p.color }} />
              <span className="font-display text-[11px] text-ink-dim">{p.name}</span>
              <span className="font-mono text-[9px] text-ink-faint">{p.terrs}T</span>
            </motion.div>
          ))}
        </motion.div>

        {/* Buttons: Cancel (dismiss) + Confirm (rematch) */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => void navigate('/')}
            className="flex-1 border border-line py-2 font-mono text-[10px] uppercase tracking-widest text-ink-dim transition-colors hover:border-line-2 hover:text-ink"
          >
            Home
          </button>
          {mode === 'room' ? (
            <button
              type="button"
              onClick={() => void navigate(roomId ? `/lobby/${roomId}` : '/lobby')}
              className="flex-1 border border-hot bg-hot/10 py-2 font-mono text-[10px] uppercase tracking-widest text-hot transition-colors hover:bg-hot/20"
            >
              Back to lobby
            </button>
          ) : (
            <button
              type="button"
              onClick={onRematch}
              className="flex-1 border border-hot bg-hot/10 py-2 font-mono text-[10px] uppercase tracking-widest text-hot transition-colors hover:bg-hot/20"
            >
              Rematch
            </button>
          )}
        </div>
      </motion.dialog>
    </div>
  );
}
