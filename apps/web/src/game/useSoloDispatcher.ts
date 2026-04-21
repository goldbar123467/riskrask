import type { Action, Effect, GameState } from '@riskrask/engine';
import { useEffect, useRef } from 'react';
import { dilettanteTurn } from './aiRunner';
import { useGame } from './useGame';

/**
 * Throttle between AI actions. Dice-rolling actions ride a slightly slower
 * beat so the 600ms shake animation reads clearly; other actions (trades,
 * placements, fortify) are fast enough to feel responsive even on 20+ action
 * closeout turns.
 */
const AI_TICK_SLOW_MS = 420; // attack / blitz — paced for dice animation
const AI_TICK_FAST_MS = 140; // non-dice actions (reinforce, trade, fortify, end-turn)
const AI_TICK_SETUP_MS = 60; // setup-claim / setup-reinforce — even faster

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

    // Setup phases run at the fastest tempo so the claim/place ritual doesn't
    // drag. Dice combat gets the slower beat. Everything else in between.
    const isSetup = state.phase === 'setup-claim' || state.phase === 'setup-reinforce';
    const isAttack = state.phase === 'attack';
    const tickMs = isSetup ? AI_TICK_SETUP_MS : isAttack ? AI_TICK_SLOW_MS : AI_TICK_FAST_MS;

    timerRef.current = setTimeout(() => {
      runAiStep(state, dispatch);
    }, tickMs);

    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [state, dispatch]);
}

function runAiStep(state: GameState, dispatch: DispatchFn): void {
  const cp = state.players[state.currentPlayerIdx];
  if (!cp || !cp.isAI) return;
  if (state.phase === 'done') return;

  const actions = dilettanteTurn(state, cp.id);
  let dispatched = false;
  for (const action of actions) {
    try {
      // Dice-rolling and post-capture moves each get their own tick so the
      // dice animation + capture readout have space to breathe. Every other
      // action type flushes immediately in this batch.
      if (action.type === 'attack-blitz' || action.type === 'attack') {
        dispatch(action);
        return;
      }
      if (action.type === 'move-after-capture') {
        dispatch(action);
        return;
      }
      dispatch(action);
      dispatched = true;
    } catch {
      // An engine rejection mid-batch means the AI's plan went stale (rare —
      // usually from a prior action changing the board). Bail out of the
      // remaining batch; the next tick recomputes from the current state.
      break;
    }
  }

  // Safety valve: if the entire batch failed (or was empty) and we're mid-turn,
  // forcibly end the turn so the dispatcher doesn't deadlock on an unchanged state.
  if (!dispatched) {
    try {
      dispatch({ type: 'end-turn' });
    } catch {
      // nothing more we can do; next tick will re-evaluate
    }
  }
}
