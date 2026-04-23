import { useGame } from '../../game/useGame';

interface LogPanelProps {
  humanPlayerId: string;
}

/**
 * Log tab (rail icon "log"). Full scrollable game history, grouped by turn.
 *
 * Implementer agent fills this out fully.
 */
export function LogPanel({ humanPlayerId }: LogPanelProps) {
  void humanPlayerId;
  const log = useGame((s) => s.log);
  // Group entries by turn so the panel renders as nested sections.
  const byTurn = new Map<number, { turn: number; text: string }[]>();
  for (const line of log) {
    const bucket = byTurn.get(line.turn) ?? [];
    bucket.push(line);
    byTurn.set(line.turn, bucket);
  }
  const turns = Array.from(byTurn.entries()).sort(([a], [b]) => b - a);
  return (
    <div className="flex flex-col gap-2 border-b border-line px-4 py-3" aria-label="log-panel">
      <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-ink-faint">Log</p>
      <div className="flex max-h-80 flex-col gap-2 overflow-y-auto">
        {turns.length === 0 && (
          <p className="font-mono text-[10px] text-ink-faint">No events yet.</p>
        )}
        {turns.map(([turn, entries]) => (
          <section key={turn} className="flex flex-col gap-0.5">
            <h3 className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink-faint">
              Turn {turn + 1}
            </h3>
            <ul className="flex flex-col gap-0.5 pl-2">
              {entries.map((entry, idx) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: log is append-only
                <li key={idx} className="font-mono text-[10px] text-ink-dim">
                  {entry.text}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
