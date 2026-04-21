import type { Action, Effect, GameState, TerritoryName } from '@riskrask/engine';
import { apply } from '@riskrask/engine';
import { create } from 'zustand';

export interface LogLine {
  readonly turn: number;
  readonly text: string;
}

/** Upper bound on the rolling intel-feed log. The UI only reads the newest 4. */
const LOG_CAP = 200;

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

  setSelected: (name: TerritoryName | null) => void;
  setHover: (name: TerritoryName | null) => void;

  /** Clear oldest effect once it has been consumed by UI */
  shiftEffect: () => void;
}

function appendLog(prev: LogLine[], effects: readonly Effect[], turn: number): LogLine[] {
  const additions: LogLine[] = [];
  for (const e of effects) {
    if (e.kind === 'log') additions.push({ turn, text: e.text });
    else if (e.kind === 'territory-captured')
      additions.push({ turn, text: `${e.to} captured from ${e.from}.` });
    else if (e.kind === 'player-eliminated')
      additions.push({ turn, text: `${e.playerId} eliminated.` });
    else if (e.kind === 'game-over') additions.push({ turn, text: `${e.winner} wins the game.` });
  }
  if (additions.length === 0) return prev;
  const merged = [...prev, ...additions];
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

  setSelected: (name) => set({ selected: name }),
  setHover: (name) => set({ hoverTarget: name }),

  shiftEffect: () => set((prev) => ({ effectsQueue: prev.effectsQueue.slice(1) })),
}));
