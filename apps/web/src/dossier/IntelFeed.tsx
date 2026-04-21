import type { GameState } from '@riskrask/engine';
import { AnimatePresence, motion } from 'framer-motion';
import { useGame } from '../game/useGame';
import type { LogLine } from '../game/useGame';
import { useReducedMotion } from '../hooks/useReducedMotion';

interface IntelFeedProps {
  state: GameState;
}

type EventTone = 'conquest' | 'elimination' | 'victory' | 'neutral';

/**
 * Cheap classifier — matches the strings produced by `appendLog` in
 * `useGame.ts` plus generic `log` effects from the engine. Falls back to
 * "neutral" so we never colour the wrong line by mistake.
 */
function classify(text: string): EventTone {
  if (/wins\s+the\s+game/i.test(text)) return 'victory';
  if (/eliminated/i.test(text)) return 'elimination';
  if (/captured/i.test(text)) return 'conquest';
  return 'neutral';
}

const TONE_COLOR: Record<EventTone, string> = {
  conquest: 'var(--hot)',
  elimination: 'var(--danger)',
  victory: 'var(--ok)',
  neutral: 'var(--ink-faint)',
};

/**
 * Intel feed: rolling event log with colour-coded type and animated entry.
 * Shows the latest 6 entries; new ones slide in from the right.
 */
export function IntelFeed({ state: _state }: IntelFeedProps) {
  const log = useGame((s) => s.log);
  const reduced = useReducedMotion();
  const entries = [...log].reverse().slice(0, 6);

  return (
    <div className="flex flex-col gap-0 border-b border-line" aria-label="intel-feed">
      <p className="px-4 py-2 font-mono text-[9px] uppercase tracking-[0.16em] text-ink-ghost">
        Intel
      </p>
      {entries.length === 0 ? (
        <p className="px-4 pb-3 font-mono text-[9px] text-ink-ghost">Awaiting first contact</p>
      ) : (
        <ul className="flex flex-col" aria-label="intel-entries">
          <AnimatePresence initial={false}>
            {entries.map((entry, i) => (
              <IntelRow key={entryKey(entry, i)} entry={entry} reduced={reduced} />
            ))}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );
}

function entryKey(entry: LogLine, i: number): string {
  // Stable-ish key: turn + first 24 chars of text + index. Engine doesn't tag
  // events with ids so we synthesise one that's stable for AnimatePresence.
  return `${entry.turn}-${entry.text.slice(0, 24)}-${i}`;
}

function IntelRow({ entry, reduced }: { entry: LogLine; reduced: boolean }) {
  const tone = classify(entry.text);
  const color = TONE_COLOR[tone];
  const { firstWord, rest } = splitFirstWord(entry.text);

  return (
    <motion.li
      layout
      initial={reduced ? { opacity: 0 } : { opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, x: -8 }}
      transition={{ duration: reduced ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
      className="flex items-baseline gap-2 border-t border-line/40 px-4 py-1.5"
    >
      <span className="shrink-0 font-mono text-[8px] text-ink-ghost">T{entry.turn}</span>
      <span
        aria-hidden
        className="h-1 w-1 shrink-0 rounded-full"
        style={{
          background: color,
          boxShadow: tone === 'neutral' ? undefined : `0 0 6px ${color}`,
        }}
      />
      <span className="overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[9px] text-ink-faint">
        <span style={{ color, fontWeight: 600 }}>{firstWord}</span>
        {rest && <span>{rest}</span>}
      </span>
    </motion.li>
  );
}

function splitFirstWord(text: string): { firstWord: string; rest: string } {
  const trimmed = text.trimStart();
  const m = trimmed.match(/^(\S+)(\s.*)?$/);
  if (!m) return { firstWord: text, rest: '' };
  const first = m[1] ?? '';
  // Capitalize first letter of the first word for visual punch.
  const cap = first.charAt(0).toUpperCase() + first.slice(1);
  return { firstWord: cap, rest: m[2] ?? '' };
}
