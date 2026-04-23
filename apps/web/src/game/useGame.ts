import type { Action, Effect, GameState, TerritoryName } from '@riskrask/engine';
import { apply } from '@riskrask/engine';
import { create } from 'zustand';

/**
 * Category tag for an Intel feed entry. Derived at log-append time from the
 * effect that spawned it; the Intel panel uses it for filter chips. Kept
 * optional so legacy callers constructing `LogLine` objects by hand still
 * compile — an absent `kind` is treated as `'log'`.
 */
export type LogKind = 'capture' | 'dice' | 'eliminate' | 'trade' | 'log';

export interface LogLine {
  readonly turn: number;
  readonly text: string;
  readonly kind?: LogKind;
}

/** Upper bound on the rolling intel-feed log. The UI only reads the newest 4. */
const LOG_CAP = 200;
/**
 * Per-turn cap on log entries. A blitz chain can produce 10+ capture events in
 * a single turn; without this cap the intel feed gets swamped and older turns
 * scroll off screen instantly. When exceeded, the oldest entries for that same
 * turn are dropped in favour of the newest.
 */
export const PER_TURN_CAP = 6;

interface GameStore {
  state: GameState | null;
  selected: TerritoryName | null;
  hoverTarget: TerritoryName | null;
  effectsQueue: Effect[];
  /**
   * Rolling log of human-readable events, kept alongside state so the engine
   * can stay pure. `effect.kind === 'log'` entries land here; other effects
   * still flow through `effectsQueue` for transient UI use (dice, modals).
   */
  log: LogLine[];

  /** Load or reset to a fresh game state */
  loadState: (s: GameState) => void;

  /** Apply an engine action. Returns effects from this action. */
  dispatch: (action: Action) => Effect[];

  /**
   * Append a batch of effects produced elsewhere (e.g. the server on a
   * multiplayer `applied` frame, after the local reducer has already advanced
   * state). Funnels through the same log-accumulation path `dispatch` uses;
   * the zustand state itself is not re-derived here. Pure plumbing — solo
   * never calls this path.
   */
  applyEffects: (effects: Effect[]) => void;

  setSelected: (name: TerritoryName | null) => void;
  setHover: (name: TerritoryName | null) => void;

  /** Clear oldest effect once it has been consumed by UI */
  shiftEffect: () => void;
}

/**
 * Classify a `log`-kind effect's free-text by keyword. Covers trade entries,
 * which are emitted by the engine as plain `log` effects rather than a
 * dedicated kind. Keep patterns case-insensitive and broad.
 */
function classifyLogText(text: string): LogKind {
  if (/trades? cards?/i.test(text)) return 'trade';
  return 'log';
}

export function appendLog(prev: LogLine[], effects: readonly Effect[], turn: number): LogLine[] {
  const additions: LogLine[] = [];
  for (const e of effects) {
    if (e.kind === 'log') {
      additions.push({ turn, text: e.text, kind: classifyLogText(e.text) });
    } else if (e.kind === 'territory-captured') {
      additions.push({ turn, text: `${e.to} captured from ${e.from}.`, kind: 'capture' });
    } else if (e.kind === 'player-eliminated') {
      additions.push({ turn, text: `${e.playerId} eliminated.`, kind: 'eliminate' });
    } else if (e.kind === 'game-over') {
      additions.push({ turn, text: `${e.winner} wins the game.`, kind: 'eliminate' });
    } else if (e.kind === 'dice-roll') {
      // Synthesise a short dice-roll log line so the Intel panel can surface
      // combat exchanges under the `dice` filter. Purely additive; the
      // transient `effectsQueue` still drives the animated `DicePanel`.
      additions.push({
        turn,
        text: `Dice atk [${e.atk.join(',')}] vs def [${e.def.join(',')}].`,
        kind: 'dice',
      });
    }
  }
  if (additions.length === 0) return prev;
  let merged = [...prev, ...additions];
  // Per-turn cap: drop oldest entries with `turn` === `turn` beyond PER_TURN_CAP.
  // Entries from earlier turns are untouched.
  const sameTurnCount = merged.reduce((n, entry) => n + (entry.turn === turn ? 1 : 0), 0);
  if (sameTurnCount > PER_TURN_CAP) {
    const drop = sameTurnCount - PER_TURN_CAP;
    let dropped = 0;
    merged = merged.filter((entry) => {
      if (entry.turn === turn && dropped < drop) {
        dropped++;
        return false;
      }
      return true;
    });
  }
  return merged.length > LOG_CAP ? merged.slice(merged.length - LOG_CAP) : merged;
}

export const useGame = create<GameStore>((set, get) => ({
  state: null,
  selected: null,
  hoverTarget: null,
  effectsQueue: [],
  log: [],

  loadState: (s) => set({ state: s, selected: null, hoverTarget: null, effectsQueue: [], log: [] }),

  dispatch: (action) => {
    const { state } = get();
    if (!state) return [];

    const { next, effects } = apply(state, action);
    set((prev) => ({
      state: next,
      // Auto-clear selection after phase-changing actions
      selected:
        action.type === 'end-attack-phase' || action.type === 'end-turn' ? null : prev.selected,
      effectsQueue: [...prev.effectsQueue, ...effects],
      log: appendLog(prev.log, effects, next.turn),
    }));
    return effects;
  },

  applyEffects: (effects) => {
    if (effects.length === 0) return;
    set((prev) => {
      const turn = prev.state?.turn ?? 0;
      return {
        effectsQueue: [...prev.effectsQueue, ...effects],
        log: appendLog(prev.log, effects, turn),
      };
    });
  },

  setSelected: (name) => set({ selected: name }),
  setHover: (name) => set({ hoverTarget: name }),

  shiftEffect: () => set((prev) => ({ effectsQueue: prev.effectsQueue.slice(1) })),
}));
