import type { GameState } from '@riskrask/engine';

interface IntelFeedProps {
  state: GameState;
}

/**
 * Last 4 log entries, newest first. Long lines truncate with ellipsis.
 */
export function IntelFeed({ state }: IntelFeedProps) {
  const entries = [...state.log].reverse().slice(0, 4);

  return (
    <div className="flex flex-col gap-0 border-b border-line" aria-label="intel-feed">
      <p className="px-4 py-2 font-mono text-[9px] uppercase tracking-[0.16em] text-ink-ghost">
        Intel
      </p>
      {entries.length === 0 ? (
        <p className="px-4 pb-3 font-mono text-[9px] text-ink-ghost">No events yet</p>
      ) : (
        entries.map((entry, i) => (
          <div
            key={`${entry.turn}-${i}`}
            className="flex items-baseline gap-2 border-t border-line/40 px-4 py-1.5"
          >
            <span className="shrink-0 font-mono text-[8px] text-ink-ghost">T{entry.turn}</span>
            <span className="overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[9px] text-ink-faint">
              {entry.text}
            </span>
          </div>
        ))
      )}
    </div>
  );
}
