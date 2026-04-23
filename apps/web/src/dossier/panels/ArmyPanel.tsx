import type { GameState } from '@riskrask/engine';

interface ArmyPanelProps {
  state: GameState;
  humanPlayerId: string;
}

/**
 * Army tab (rail icon "army"). A per-seat roster: color, display name,
 * territory count, total armies on the board, reserves, continents held.
 *
 * Implementer agent fills this out fully. This stub renders the minimal
 * data so the tab is never blank while the real panel is still being
 * assembled.
 */
export function ArmyPanel({ state, humanPlayerId }: ArmyPanelProps) {
  return (
    <div className="flex flex-col gap-2 border-b border-line px-4 py-3" aria-label="army-panel">
      <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-ink-faint">Army</p>
      <ul className="flex flex-col gap-1">
        {state.players
          .filter((p) => !p.isNeutral)
          .map((p) => {
            const terrs = Object.values(state.territories).filter((t) => t.owner === p.id).length;
            const totalArmies = Object.values(state.territories)
              .filter((t) => t.owner === p.id)
              .reduce((n, t) => n + t.armies, 0);
            const tag = p.id === humanPlayerId ? 'YOU' : p.isAI ? 'AI' : '';
            return (
              <li
                key={p.id}
                className="flex items-center justify-between font-mono text-[10px]"
                style={{ color: p.color }}
              >
                <span>
                  {p.name} {tag && <span className="text-ink-faint">· {tag}</span>}
                </span>
                <span className="text-ink-dim">
                  {terrs} terr · {totalArmies} armies · {p.reserves} res
                </span>
              </li>
            );
          })}
      </ul>
    </div>
  );
}
