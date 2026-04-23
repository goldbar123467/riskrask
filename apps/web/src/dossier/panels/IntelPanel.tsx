import type { GameState } from '@riskrask/engine';
import { useMemo, useState } from 'react';
import { type LogKind, type LogLine, useGame } from '../../game/useGame';

interface IntelPanelProps {
  state: GameState;
  humanPlayerId: string;
}

const MAX_VISIBLE = 80;

type FilterId = 'all' | LogKind;

interface CategoryMeta {
  id: FilterId;
  label: string;
  color: string;
  /** ASCII glyph rendered before the row text. Keep single-column-width. */
  icon: string;
}

/**
 * Categories for the filter bar, in render order. Glyphs are ASCII so they
 * align in the JetBrains Mono column grid used by the Intel list.
 */
const CATEGORIES: readonly CategoryMeta[] = [
  { id: 'all', label: 'all', color: 'var(--ink-faint)', icon: '*' },
  { id: 'capture', label: 'captures', color: 'var(--hot)', icon: '>' },
  { id: 'dice', label: 'dice', color: 'var(--warn)', icon: '#' },
  { id: 'eliminate', label: 'eliminations', color: 'var(--danger)', icon: 'x' },
  { id: 'trade', label: 'trades', color: 'var(--ok)', icon: '+' },
  { id: 'log', label: 'log', color: 'var(--ink-dim)', icon: '-' },
];

const CATEGORY_BY_KIND: Record<LogKind, CategoryMeta> = CATEGORIES.reduce(
  (acc, c) => {
    if (c.id !== 'all') acc[c.id] = c;
    return acc;
  },
  {} as Record<LogKind, CategoryMeta>,
);

function kindOf(entry: LogLine): LogKind {
  return entry.kind ?? 'log';
}

/**
 * Intel tab. Richer relative of `IntelFeed`. Renders the full rolling event
 * log (capped at MAX_VISIBLE) with toggle-chip filtering by category and
 * turn-header grouping. Highlights the current turn's block.
 *
 * Filter semantics: `all` on means show everything regardless of other
 * chips. Toggling any other chip turns `all` off; clearing every other chip
 * re-enables `all`. Among non-`all` chips the semantics is union (any
 * selected category matches) — multi-select is additive, not intersecting,
 * because each entry has exactly one kind.
 */
export function IntelPanel({ state, humanPlayerId }: IntelPanelProps) {
  void humanPlayerId;
  const log = useGame((s) => s.log);
  const [active, setActive] = useState<ReadonlySet<FilterId>>(() => new Set(['all']));

  const filtered = useMemo(() => {
    const showAll = active.has('all');
    const reversed = [...log].reverse();
    const matches = showAll
      ? reversed
      : reversed.filter((entry) => active.has(kindOf(entry) satisfies LogKind));
    return matches.slice(0, MAX_VISIBLE);
  }, [log, active]);

  const currentTurn = state.turn;
  const groups = useMemo(() => groupByTurn(filtered), [filtered]);

  const toggle = (id: FilterId) => {
    setActive((prev) => {
      const next = new Set(prev);
      if (id === 'all') {
        return new Set(['all']);
      }
      next.delete('all');
      if (next.has(id)) next.delete(id);
      else next.add(id);
      if (next.size === 0) return new Set(['all']);
      return next;
    });
  };

  return (
    <div
      className="flex flex-col gap-2 border-b border-line px-4 py-3"
      aria-label="intel-panel"
      data-active-filters={[...active].sort().join(',')}
    >
      <header className="flex items-baseline justify-between">
        <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-ink-faint">Intel</p>
        <p
          className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink-faint"
          aria-label="intel-summary"
        >
          {log.length} events · turn {state.turn + 1}
        </p>
      </header>

      <fieldset className="flex flex-wrap gap-1 border-0 p-0" aria-label="intel-filters">
        {CATEGORIES.map((cat) => {
          const on = active.has(cat.id);
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => toggle(cat.id)}
              aria-pressed={on}
              aria-label={`filter-${cat.id}`}
              className={`rounded-sm border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] transition-colors ${
                on
                  ? 'border-line-2 bg-panel-2 text-ink'
                  : 'border-line bg-transparent text-ink-faint hover:text-ink-dim'
              }`}
              style={on ? { color: cat.color, borderColor: cat.color } : undefined}
            >
              {cat.label}
            </button>
          );
        })}
      </fieldset>

      <div
        className="flex max-h-80 flex-col gap-2 overflow-y-auto"
        aria-label="intel-entries"
        data-visible-count={filtered.length}
      >
        {filtered.length === 0 ? (
          <p className="font-mono text-[10px] text-ink-faint">No events match this filter.</p>
        ) : (
          groups.map(({ turn, entries }) => {
            const isCurrent = turn === currentTurn;
            return (
              <section
                key={turn}
                className="flex flex-col gap-0.5"
                aria-label={`turn-${turn + 1}-group`}
                data-current-turn={isCurrent}
              >
                <h3 className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink-faint">
                  — Turn {turn + 1} —
                </h3>
                <ul className="flex flex-col gap-0.5">
                  {entries.map((entry, idx) => {
                    const meta = CATEGORY_BY_KIND[kindOf(entry)];
                    return (
                      <li
                        // biome-ignore lint/suspicious/noArrayIndexKey: log is append-only; index is stable within a turn bucket
                        key={idx}
                        className={`flex items-baseline gap-2 rounded-sm px-1.5 py-0.5 font-mono text-[10px] text-ink-dim ${isCurrent ? 'bg-panel-2' : ''}`}
                        data-kind={kindOf(entry)}
                      >
                        <span className="shrink-0 text-ink-faint">T{entry.turn + 1}</span>
                        <span
                          aria-hidden
                          className="shrink-0"
                          style={{ color: meta.color, fontWeight: 600 }}
                        >
                          {meta.icon}
                        </span>
                        <span className="truncate">{entry.text}</span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}

/**
 * Group a reversed (newest-first) entry list into per-turn buckets while
 * preserving the incoming order. Each bucket keeps entries in the same
 * reverse order they arrived in, so the newest event within a turn sits at
 * the top of its group.
 */
function groupByTurn(entries: readonly LogLine[]): { turn: number; entries: LogLine[] }[] {
  const out: { turn: number; entries: LogLine[] }[] = [];
  let current: { turn: number; entries: LogLine[] } | null = null;
  for (const e of entries) {
    if (!current || current.turn !== e.turn) {
      current = { turn: e.turn, entries: [] };
      out.push(current);
    }
    current.entries.push(e);
  }
  return out;
}
