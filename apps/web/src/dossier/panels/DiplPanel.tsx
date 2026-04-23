import type { GameState } from '@riskrask/engine';

interface DiplPanelProps {
  state: GameState;
  humanPlayerId: string;
}

/**
 * Diplomacy tab (rail icon "dipl"). Relationship matrix: attack counts
 * between pairs, grudge bars, standing columns. Read-only in v1.
 *
 * Implementer agent fills this out fully.
 */
export function DiplPanel({ state, humanPlayerId }: DiplPanelProps) {
  const others = state.players.filter((p) => !p.isNeutral && p.id !== humanPlayerId);
  return (
    <div className="flex flex-col gap-2 border-b border-line px-4 py-3" aria-label="dipl-panel">
      <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-ink-faint">Diplomacy</p>
      {others.length === 0 ? (
        <p className="font-mono text-[10px] text-ink-faint">No rivals.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {others.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between font-mono text-[10px]"
              style={{ color: p.color }}
            >
              <span>{p.name}</span>
              <span className="text-ink-dim">{p.eliminated ? 'eliminated' : 'active'}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
