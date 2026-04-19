import type { Action, Effect, GameState, TerritoryName } from '@riskrask/engine';
import { apply } from '@riskrask/engine';
import { create } from 'zustand';

interface GameStore {
  state: GameState | null;
  selected: TerritoryName | null;
  hoverTarget: TerritoryName | null;
  effectsQueue: Effect[];

  /** Load or reset to a fresh game state */
  loadState: (s: GameState) => void;

  /** Apply an engine action. Returns effects from this action. */
  dispatch: (action: Action) => Effect[];

  setSelected: (name: TerritoryName | null) => void;
  setHover: (name: TerritoryName | null) => void;

  /** Clear oldest effect once it has been consumed by UI */
  shiftEffect: () => void;
}

export const useGame = create<GameStore>((set, get) => ({
  state: null,
  selected: null,
  hoverTarget: null,
  effectsQueue: [],

  loadState: (s) => set({ state: s, selected: null, hoverTarget: null, effectsQueue: [] }),

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
    }));
    return effects;
  },

  setSelected: (name) => set({ selected: name }),
  setHover: (name) => set({ hoverTarget: name }),

  shiftEffect: () => set((prev) => ({ effectsQueue: prev.effectsQueue.slice(1) })),
}));
