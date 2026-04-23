import type { GameState } from '@riskrask/engine';
import { useGame } from '../../game/useGame';

interface IntelPanelProps {
  state: GameState;
  humanPlayerId: string;
}

/**
 * Intel tab (rail icon "intel"). Rich event feed — dice rolls, captures,
 * eliminations, trades. Reads from the zustand log slice (populated by
 * every dispatched action's effects).
 *
 * Implementer agent fills this out fully.
 */
export function IntelPanel({ state, humanPlayerId }: IntelPanelProps) {
  void humanPlayerId;
  const log = useGame((s) => s.log);
  return (
    <div className="flex flex-col gap-2 border-b border-line px-4 py-3" aria-label="intel-panel">
      <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-ink-faint">
        Intel · turn {state.turn + 1}
      </p>
      <ul className="flex max-h-64 flex-col gap-0.5 overflow-y-auto">
        {log
          .slice(-30)
          .reverse()
          .map((line, idx) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: log is append-only; index is stable
            <li key={idx} className="font-mono text-[10px] text-ink-dim">
              <span className="text-ink-faint">T{line.turn + 1}</span> {line.text}
            </li>
          ))}
        {log.length === 0 && (
          <li className="font-mono text-[10px] text-ink-faint">No events yet.</li>
        )}
      </ul>
    </div>
  );
}
