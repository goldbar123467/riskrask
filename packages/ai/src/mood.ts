/**
 * Mood — visible tells. Ported from v2 `const Mood`.
 * Maps recent events to mood strings + display icons.
 */

import type { ArchDef } from './arch.js';

export type MoodEvent = 'captured' | 'lost' | 'attacked' | 'won';

export interface MoodIcon {
  readonly glyph: string;
  readonly color: string;
}

// Ported verbatim from v2 `icon()` map
const MOOD_ICONS: Readonly<Record<string, MoodIcon>> = Object.freeze({
  triumphant: { glyph: '✚', color: '#10b981' },
  victorious: { glyph: '✪', color: '#f59e0b' },
  confident: { glyph: '◈', color: '#2563eb' },
  content: { glyph: '◆', color: '#475569' },
  serene: { glyph: '◉', color: '#059669' },
  rapturous: { glyph: '✦', color: '#f59e0b' },
  ascendant: { glyph: '⬢', color: '#f59e0b' },
  luminous: { glyph: '☀', color: '#fbbf24' },
  satisfied: { glyph: '◈', color: '#059669' },
  stoic: { glyph: '▮', color: '#94a3b8' },
  composed: { glyph: '☯', color: '#0ea5e9' },
  bowed: { glyph: '⏛', color: '#0ea5e9' },
  gorged: { glyph: '●', color: '#d97706' },
  hungry: { glyph: '◐', color: '#d97706' },
  furious: { glyph: '✦', color: '#dc2626' },
  insulted: { glyph: '▲', color: '#dc2626' },
  vengeful: { glyph: '✗', color: '#7c3aed' },
  seething: { glyph: '⚡', color: '#7c3aed' },
  incensed: { glyph: '⚔', color: '#7c3aed' },
  stewing: { glyph: '◌', color: '#475569' },
  slinking: { glyph: '◢', color: '#d97706' },
  dishonored: { glyph: '⏜', color: '#94a3b8' },
  wounded: { glyph: '✂', color: '#dc2626' },
  neutral: { glyph: '·', color: '#94a3b8' },
  watchful: { glyph: '⟢', color: '#475569' },
  alert: { glyph: '⌖', color: '#0ea5e9' },
  stalking: { glyph: '◤', color: '#d97706' },
  brooding: { glyph: '◔', color: '#7c3aed' },
  meditative: { glyph: '◌', color: '#059669' },
  still: { glyph: '▯', color: '#0ea5e9' },
  withdrawn: { glyph: '◎', color: '#ec4899' },
  patient: { glyph: '∽', color: '#059669' },
  tested: { glyph: '✛', color: '#f59e0b' },
  indifferent: { glyph: '—', color: '#94a3b8' },
  disturbed: { glyph: '≈', color: '#ec4899' },
  roused: { glyph: '▲', color: '#ec4899' },
  unmoved: { glyph: '▪', color: '#059669' },
  annoyed: { glyph: '◣', color: '#d97706' },
  nodding: { glyph: '⌒', color: '#059669' },
  'cold-smile': { glyph: '⌣', color: '#7c3aed' },
  'baring-teeth': { glyph: '⌇', color: '#dc2626' },
  'drawn-blade': { glyph: '⟊', color: '#0ea5e9' },
  wrathful: { glyph: '⚡', color: '#dc2626' },
  sparse: { glyph: '·', color: '#ec4899' },
  sage: { glyph: '◉', color: '#059669' },
  vindicated: { glyph: '✓', color: '#7c3aed' },
});

export function computeMood(arch: ArchDef, recentEvents: readonly string[]): string {
  const m = arch.mood;
  const recent = recentEvents[0];
  if (recent === 'captured') return m.onCapture;
  if (recent === 'lost') return m.onLoss;
  if (recent === 'attacked') return m.onAttacked;
  if (recent === 'won') return m.onWin;
  return m.default;
}

export function moodIcon(mood: string): MoodIcon {
  return MOOD_ICONS[mood] ?? MOOD_ICONS['neutral'] ?? { glyph: '·', color: '#94a3b8' };
}

/** Push a new event onto the recent-events stack (max 3), return updated stack. */
export function recordMoodEvent(
  recentEvents: readonly string[],
  event: MoodEvent,
): readonly string[] {
  const next = [event, ...recentEvents].slice(0, 3);
  return next;
}

export const Mood = {
  compute: computeMood,
  icon: moodIcon,
  record: recordMoodEvent,
  ICONS: MOOD_ICONS,
};
