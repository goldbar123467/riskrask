import type { Action, Effect, GameState } from '@riskrask/engine';
import { useEffect, useRef } from 'react';
import { dilettanteTurn } from './aiRunner';
import { useGame } from './useGame';

const AI_TICK_MS = 450;

type DispatchFn = (action: Action) => Effect[];

/**
 * Solo dispatcher: watches state changes and, when the current player is AI,
 * enqueues dilettanteTurn actions with a 450ms throttle so dice can animate.
 */
export function useSoloDispatcher(_humanPlayerId: string): void {
  const state = useGame((s) => s.state);
  const dispatch = useGame((s) => s.dispatch);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!state) return;
    if (state.phase === 'done') return;

    const cp = state.players[state.currentPlayerIdx];
    if (!cp || !cp.isAI) return;

    timerRef.current = setTimeout(() => {
      runAiStep(state, dispatch);
    }, AI_TICK_MS);

    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [state, dispatch]);
}

function runAiStep(
  state: GameState,
  dispatch: DispatchFn,
): void {
  const cp = state.players[state.currentPlayerIdx];
  if (!cp || !cp.isAI) return;
  if (state.phase === 'done') return;

  const actions = dilettanteTurn(state, cp.id);
  for (const action of actions) {
    // After a move-after-capture, the state might need a special dispatch
    if (action.type === 'attack-blitz' || action.type === 'attack') {
      dispatch(action);
      // If pendingMove is now set, we need to resolve it
      // The effect loop will handle via the next state update
      return;
    }
    if (action.type === 'move-after-capture') {
      dispatch(action);
      return;
    }
    dispatch(action);
  }
}
