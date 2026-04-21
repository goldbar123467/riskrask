import type { GameState } from '@riskrask/engine';
import { findBestSet } from '@riskrask/engine';

export type UIPhase = 'Draft' | 'Deploy' | 'Attack' | 'Fortify' | 'End' | 'Setup' | 'Done';

/**
 * Maps engine phase + sub-flags to the 5 UI tab labels.
 * "Draft" = reinforce phase when player holds a tradeable set of cards.
 * "Deploy" = reinforce phase after trades (or when no tradeable set exists).
 */
export function uiPhase(state: GameState, playerId: string, draftSkipped = false): UIPhase {
  if (state.phase === 'setup-claim' || state.phase === 'setup-reinforce') return 'Setup';
  if (state.phase === 'done') return 'Done';

  const player = state.players.find((p) => p.id === playerId);
  if (!player) return 'Deploy';

  if (state.phase === 'reinforce') {
    // Forced-trade override always routes to Draft; the modal takes over.
    if (state.pendingForcedTrade?.playerId === playerId) return 'Draft';
    if (draftSkipped) return 'Deploy';
    const owned = new Set<string>();
    for (const [name, t] of Object.entries(state.territories)) {
      if (t.owner === playerId) owned.add(name);
    }
    const best = findBestSet(player.cards, owned);
    return best ? 'Draft' : 'Deploy';
  }
  if (state.phase === 'attack') return 'Attack';
  if (state.phase === 'fortify') return 'Fortify';

  return 'Deploy';
}

export function uiPhaseLabel(phase: UIPhase): string {
  const MAP: Record<UIPhase, string> = {
    Draft: '01 DRAFT',
    Deploy: '02 DEPLOY',
    Attack: '03 ATTACK',
    Fortify: '04 FORTIFY',
    End: '05 END',
    Setup: 'SETUP',
    Done: 'DONE',
  };
  return MAP[phase];
}
