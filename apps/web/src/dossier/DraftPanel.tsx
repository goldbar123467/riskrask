import type { Card, GameState } from '@riskrask/engine';
import { findBestSet } from '@riskrask/engine';

interface DraftPanelProps {
  state: GameState;
  humanPlayerId: string;
  onTrade: (indices: [number, number, number]) => void;
  onSkip: () => void;
}

/**
 * Card trade UI shown when phase === reinforce (trade step).
 * Detects three-of-a-kind / one-of-each sets and shows tradeable options.
 */
export function DraftPanel({ state, humanPlayerId, onTrade, onSkip }: DraftPanelProps) {
  const player = state.players.find((p) => p.id === humanPlayerId);
  const cards = player?.cards ?? [];
  const ownedTerritories = new Set(
    Object.entries(state.territories)
      .filter(([, t]) => t.owner === humanPlayerId)
      .map(([name]) => name),
  );
  const bestSet = cards.length >= 3 ? findBestSet(cards as Card[], ownedTerritories) : null;

  return (
    <div className="flex flex-col gap-3 border-b border-line px-4 py-4" aria-label="draft-panel">
      <div>
        <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink-faint">Phase</p>
        <h2 className="font-display text-2xl font-semibold tracking-[0.1em] text-ink">DRAFT</h2>
      </div>

      <p className="font-mono text-[10px] text-ink-faint">
        {cards.length} card{cards.length !== 1 ? 's' : ''} in hand
      </p>

      {/* Card list */}
      <div className="flex flex-wrap gap-1.5">
        {cards.map((card, i) => (
          <div
            key={`${card.type}-${card.territory ?? ''}-${i}`}
            className="flex flex-col items-center gap-0.5 border border-line bg-panel p-1.5"
          >
            <span className="font-mono text-[8px] uppercase text-ink-faint">{card.type}</span>
            {card.territory && (
              <span className="font-mono text-[7px] text-ink-ghost">
                {card.territory.length > 8 ? card.territory.substring(0, 8) : card.territory}
              </span>
            )}
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onSkip}
          className="flex-1 border border-line py-2 font-mono text-[10px] uppercase tracking-widest text-ink-dim hover:border-line-2 hover:text-ink"
        >
          Skip
        </button>
        <button
          type="button"
          onClick={() => bestSet && onTrade(bestSet)}
          disabled={!bestSet}
          className="flex-1 border border-hot bg-hot/10 py-2 font-mono text-[10px] uppercase tracking-widest text-hot hover:bg-hot/20 disabled:cursor-not-allowed disabled:border-line disabled:text-ink-ghost"
        >
          Trade Set
        </button>
      </div>
    </div>
  );
}
