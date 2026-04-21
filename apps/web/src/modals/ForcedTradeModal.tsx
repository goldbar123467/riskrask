import type { Card, ForcedTrade, GameState } from '@riskrask/engine';
import { findBestSet } from '@riskrask/engine';
import { motion } from 'framer-motion';
import { useReducedMotion } from '../hooks/useReducedMotion';

interface ForcedTradeModalProps {
  state: GameState;
  forcedTrade: ForcedTrade;
  onTrade: (indices: [number, number, number]) => void;
  onCancel: () => void;
}

/**
 * Mid-attack + end-of-turn forced card trade.
 * Always shown as Cancel (not applicable here, both valid) + Confirm pair.
 */
export function ForcedTradeModal({ state, forcedTrade, onTrade, onCancel }: ForcedTradeModalProps) {
  const reduced = useReducedMotion();
  const player = state.players.find((p) => p.id === forcedTrade.playerId);
  const cards = player?.cards ?? [];
  const ownedTerritories = new Set(
    Object.entries(state.territories)
      .filter(([, t]) => t.owner === forcedTrade.playerId)
      .map(([name]) => name),
  );
  const bestSet = findBestSet(cards as Card[], ownedTerritories);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <motion.dialog
        className="flex w-[380px] flex-col gap-5 border border-warn bg-bg-0 p-7"
        aria-label="forced-trade-modal"
        open
        initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.94, y: 6 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: reduced ? 0 : 0.24, ease: [0.22, 1, 0.36, 1] }}
        style={{ boxShadow: '0 0 28px rgba(212,162,74,0.25)' }}
      >
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-warn">
            {forcedTrade.reason === 'five-card-limit' ? 'Hand Limit' : 'Elimination Bonus'}
          </p>
          <h2 className="font-display text-xl text-ink">Trade Cards</h2>
          <p className="mt-1 font-mono text-[10px] text-ink-faint">
            {forcedTrade.reason === 'five-card-limit'
              ? 'You have 5 cards. You must trade before continuing.'
              : "Trade the eliminated player's cards."}
          </p>
        </div>

        {/* Cards — staggered hover-lift */}
        <div className="flex flex-wrap gap-1.5">
          {cards.map((card, i) => (
            <motion.div
              key={`${card.type}-${card.territory ?? ''}-${i}`}
              initial={reduced ? { opacity: 0 } : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: reduced ? 0 : 0.18,
                delay: reduced ? 0 : 0.05 + i * 0.04,
                ease: [0.22, 1, 0.36, 1],
              }}
              {...(reduced ? {} : { whileHover: { y: -2, scale: 1.04 } })}
              data-testid={`card-${i}`}
              className={`flex flex-col items-center gap-0.5 border p-1.5 ${
                bestSet?.includes(i) ? 'border-hot bg-hot/10' : 'border-line bg-panel'
              }`}
              style={{
                boxShadow: bestSet?.includes(i) ? '0 0 12px rgba(255,77,46,0.25)' : undefined,
              }}
            >
              <span className="font-mono text-[8px] uppercase text-ink-faint">{card.type}</span>
              {card.territory && (
                <span className="font-mono text-[7px] text-ink-ghost">
                  {card.territory.substring(0, 8)}
                </span>
              )}
            </motion.div>
          ))}
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 border border-line py-2 font-mono text-[10px] uppercase tracking-widest text-ink-dim transition-colors hover:border-danger hover:text-danger"
          >
            Skip
          </button>
          <button
            type="button"
            onClick={() => bestSet && onTrade(bestSet)}
            disabled={!bestSet}
            className="flex-1 border border-hot bg-hot/10 py-2 font-mono text-[10px] uppercase tracking-widest text-hot transition-colors hover:bg-hot/20 disabled:cursor-not-allowed disabled:border-line disabled:text-ink-ghost"
          >
            Trade
          </button>
        </div>
      </motion.dialog>
    </div>
  );
}
