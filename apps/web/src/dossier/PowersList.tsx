import type { GameState } from '@riskrask/engine';
import { ownedCount } from '../game/selectors';

interface PowersListProps {
  state: GameState;
  humanPlayerId: string;
}

/**
 * Per-player chip + name + territories + armies + bar.
 * "Me" row highlighted with a faction-tinted gradient stripe.
 */
export function PowersList({ state, humanPlayerId }: PowersListProps) {
  const active = state.players.filter((p) => !p.eliminated);
  const maxTerr = Math.max(...active.map((p) => ownedCount(state, p.id)), 1);

  return (
    <div className="flex flex-col gap-0 border-b border-line" aria-label="powers-list">
      <p className="px-4 py-2 font-mono text-[9px] uppercase tracking-[0.16em] text-ink-ghost">
        Powers
      </p>
      {state.players.map((player) => {
        const isMe = player.id === humanPlayerId;
        const territories = ownedCount(state, player.id);
        const armies = Object.values(state.territories)
          .filter((t) => t.owner === player.id)
          .reduce((s, t) => s + t.armies, 0);
        const barWidth = maxTerr > 0 ? (territories / maxTerr) * 100 : 0;

        return (
          <div
            key={player.id}
            className={`relative flex items-center gap-3 px-4 py-2 ${player.eliminated ? 'opacity-30' : ''}`}
            style={
              isMe
                ? {
                    background: `linear-gradient(90deg, ${player.color}18 0%, transparent 80%)`,
                  }
                : undefined
            }
          >
            {/* Faction color chip */}
            <div className="h-2.5 w-2.5 shrink-0 rotate-45" style={{ background: player.color }} />

            {/* Name */}
            <span
              className={`flex-1 truncate font-display text-[11px] ${
                isMe ? 'text-ink' : 'text-ink-dim'
              }`}
            >
              {player.name}
              {player.isAI && (
                <span className="ml-1.5 font-mono text-[8px] text-ink-ghost">AI</span>
              )}
            </span>

            {/* Stats */}
            <div className="flex items-center gap-3">
              <span className="font-mono text-[9px] text-ink-faint">{territories}T</span>
              <span className="font-mono text-[9px] text-ink-faint">{armies}A</span>
            </div>

            {/* Territory bar */}
            <div className="absolute bottom-0 left-4 right-4 h-px bg-panel-2">
              <div
                className="h-full transition-all duration-500"
                style={{ width: `${barWidth}%`, background: player.color, opacity: 0.4 }}
              />
            </div>

            {/* Active player indicator */}
            {state.players[state.currentPlayerIdx]?.id === player.id && !player.eliminated && (
              <div
                className="h-1 w-1 shrink-0 rounded-full"
                style={{ background: player.color, boxShadow: `0 0 6px ${player.color}` }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
