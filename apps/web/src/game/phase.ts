import type { GameState } from '@riskrask/engine';

export type UIPhase = 'Draft' | 'Deploy' | 'Attack' | 'Fortify' | 'End' | 'Setup' | 'Done';

/**
 * Maps engine phase + sub-flags to the 5 UI tab labels.
 * "Draft" = reinforce phase when player has tradeable cards.
 * "Deploy" = reinforce phase after trades (or no tradeable cards).
 */
export function uiPhase(state: GameState, playerId: string): UIPhase {
  if (state.phase === 'setup-claim' || state.phase === 'setup-reinforce') return 'Setup';
  if (state.phase === 'done') return 'Done';

  const player = state.players.find((p) => p.id === playerId);
  if (!player) return 'Deploy';

  if (state.phase === 'reinforce') {
    // Draft if player has 5+ cards or has a tradeable set
    if (player.cards.length >= 5) return 'Draft';
    // Could also check for valid set; for simplicity show Draft if any cards
    return 'Deploy';
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
