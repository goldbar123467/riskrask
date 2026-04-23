import { useMemo, useState } from 'react';
import { useGame } from '../../game/useGame';

interface LogPanelProps {
  humanPlayerId: string;
}

// How many most-recent turn sections are expanded by default. Older turns
// stay collapsed so the panel is skimmable on long games.
const DEFAULT_EXPANDED_RECENT = 3;

// How long the "copied" toast stays visible before fading. Kept short — this
// is a status hint, not a modal.
const COPIED_TOAST_MS = 1400;

interface TurnGroup {
  turn: number;
  entries: { turn: number; text: string }[];
}

/**
 * Log tab (rail icon "log"). Full scrollable game history grouped by turn,
 * with substring search, per-turn collapse/expand, and a copy-to-clipboard
 * action. This is the reference "what happened" panel; IntelPanel is the
 * short recency feed.
 */
export function LogPanel({ humanPlayerId }: LogPanelProps) {
  void humanPlayerId;
  const log = useGame((s) => s.log);

  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [copied, setCopied] = useState(false);

  // Group by turn, descending. Filtering happens on the flat list first so
  // that turns with zero matches disappear entirely from the grouping.
  const groups = useMemo<TurnGroup[]>(() => {
    const needle = query.trim().toLowerCase();
    const filtered =
      needle.length === 0 ? log : log.filter((l) => l.text.toLowerCase().includes(needle));

    const byTurn = new Map<number, { turn: number; text: string }[]>();
    for (const line of filtered) {
      const bucket = byTurn.get(line.turn) ?? [];
      bucket.push(line);
      byTurn.set(line.turn, bucket);
    }
    return Array.from(byTurn.entries())
      .sort(([a], [b]) => b - a)
      .map(([turn, entries]) => ({ turn, entries }));
  }, [log, query]);

  const totalEvents = log.length;
  // Turns played = max turn index + 1 (turns are 0-indexed). If the log is
  // empty we report 0 to avoid an off-by-one "1 turn" read.
  const turnsPlayed = log.length === 0 ? 0 : Math.max(...log.map((l) => l.turn)) + 1;

  // Default expansion: the 3 most-recent turns (by turn number) are expanded
  // unless the user explicitly collapsed them. Anything older is collapsed
  // unless the user explicitly expanded it.
  const defaultExpandedTurns = useMemo(() => {
    const sortedTurns = Array.from(new Set(log.map((l) => l.turn))).sort((a, b) => b - a);
    return new Set(sortedTurns.slice(0, DEFAULT_EXPANDED_RECENT));
  }, [log]);

  function isExpanded(turn: number): boolean {
    const defaultOn = defaultExpandedTurns.has(turn);
    const toggled = collapsed.has(turn);
    // XOR: default-on toggled off, or default-off toggled on.
    return defaultOn !== toggled;
  }

  function toggleTurn(turn: number) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(turn)) next.delete(turn);
      else next.add(turn);
      return next;
    });
  }

  function handleCopy() {
    const text = groups
      .map((g) => {
        const header = `Turn ${g.turn + 1}`;
        const body = g.entries.map((e) => `  ${e.text}`).join('\n');
        return `${header}\n${body}`;
      })
      .join('\n\n');
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(text).then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), COPIED_TOAST_MS);
      });
    }
  }

  return (
    <div
      className="flex flex-col gap-2 border-b border-line px-4 py-3"
      aria-label="log-panel"
      data-total-events={totalEvents}
      data-turns-played={turnsPlayed}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-ink-faint">
          Log · {totalEvents} events · {turnsPlayed} turns
        </p>
        <button
          type="button"
          onClick={handleCopy}
          aria-label="copy log to clipboard"
          className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink-dim hover:text-ink border border-line bg-bg-1 px-2 py-0.5"
        >
          {copied ? 'copied' : 'copy'}
        </button>
      </div>

      <label className="flex flex-col gap-1">
        <span className="sr-only">filter log</span>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="filter log"
          aria-label="filter log"
          className="font-mono text-[11px] bg-bg-1 border border-line px-2 py-1 text-ink placeholder:text-ink-faint focus:outline-none focus:border-ink-dim"
        />
      </label>

      <div className="flex max-h-80 flex-col gap-2 overflow-y-auto" data-testid="log-scroll">
        {groups.length === 0 && (
          <p className="font-mono text-[10px] text-ink-faint">
            {query.trim().length === 0 ? 'No events yet.' : 'No matching events.'}
          </p>
        )}
        {groups.map(({ turn, entries }) => {
          const expanded = isExpanded(turn);
          return (
            <section
              key={turn}
              className="flex flex-col gap-0.5"
              data-turn={turn}
              data-expanded={expanded}
            >
              <button
                type="button"
                onClick={() => toggleTurn(turn)}
                aria-expanded={expanded}
                aria-controls={`log-turn-${turn}`}
                className="flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.18em] text-ink-faint hover:text-ink-dim"
              >
                <span>
                  <span aria-hidden="true">{expanded ? '▾' : '▸'}</span> Turn {turn + 1}
                </span>
                <span className="text-ink-ghost">{entries.length}</span>
              </button>
              {expanded && (
                <ul id={`log-turn-${turn}`} className="flex flex-col gap-0.5 pl-3">
                  {entries.map((entry, idx) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: log is append-only
                    <li key={idx} className="font-mono text-[10px] text-ink-dim">
                      {entry.text}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
