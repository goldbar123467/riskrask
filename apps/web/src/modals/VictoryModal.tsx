import type { GameState } from '@riskrask/engine';
import { useNavigate } from 'react-router-dom';

interface VictoryModalProps {
  state: GameState;
  onRematch: () => void;
}

/**
 * Victory modal: winner name + share code + Rematch button.
 * Always shows Cancel + Confirm button pair.
 */
export function VictoryModal({ state, onRematch }: VictoryModalProps) {
  const navigate = useNavigate();
  const winner = state.players.find((p) => p.id === state.winner);

  if (!winner) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div
        className="flex w-[400px] flex-col gap-5 border border-hot bg-bg-0 p-8"
        role="dialog"
        aria-label="victory-modal"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex flex-col items-center gap-2">
          <div
            className="h-3 w-3 rotate-45"
            style={{ background: winner.color, boxShadow: `0 0 20px ${winner.color}` }}
          />
          <h2 className="font-display text-3xl font-bold tracking-[0.12em] text-hot">VICTORY</h2>
          <p className="font-display text-lg text-ink">{winner.name}</p>
          <p className="font-mono text-[9px] uppercase tracking-widest text-ink-faint">
            Turn {state.turn} · {state.players.length} players
          </p>
        </div>

        {/* Stats */}
        <div className="flex justify-center gap-6 border-t border-b border-line py-4">
          {state.players
            .filter((p) => !p.eliminated || p.id === state.winner)
            .slice(0, 4)
            .map((p) => {
              const terrs = Object.values(state.territories).filter(
                (t) => t.owner === p.id,
              ).length;
              return (
                <div key={p.id} className="flex flex-col items-center gap-1">
                  <div className="h-2 w-2 rotate-45" style={{ background: p.color }} />
                  <span className="font-display text-[11px] text-ink-dim">{p.name}</span>
                  <span className="font-mono text-[9px] text-ink-faint">{terrs}T</span>
                </div>
              );
            })}
        </div>

        {/* Buttons: Cancel (dismiss) + Confirm (rematch) */}
        <div className="flex gap-3">
          <button
            onClick={() => void navigate('/')}
            className="flex-1 border border-line py-2 font-mono text-[10px] uppercase tracking-widest text-ink-dim hover:border-line-2 hover:text-ink"
          >
            Home
          </button>
          <button
            onClick={onRematch}
            className="flex-1 border border-hot bg-hot/10 py-2 font-mono text-[10px] uppercase tracking-widest text-hot hover:bg-hot/20"
          >
            Rematch
          </button>
        </div>
      </div>
    </div>
  );
}
