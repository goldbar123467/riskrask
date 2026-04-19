import type { GameState, TerritoryName } from '@riskrask/engine';
import { uiPhase } from '../game/phase';
import { AttackPanel } from './AttackPanel';
import { CommanderCard } from './CommanderCard';
import { DeployPanel } from './DeployPanel';
import { DicePanel } from './DicePanel';
import { DraftPanel } from './DraftPanel';
import { FortifyPanel } from './FortifyPanel';
import { IntelFeed } from './IntelFeed';
import { PowersList } from './PowersList';

interface DossierProps {
  state: GameState;
  humanPlayerId: string;
  selected: TerritoryName | null;
  target: TerritoryName | null;
  attackDice: readonly number[];
  defenseDice: readonly number[];
  onDeployConfirm: () => void;
  onDeployCancel: () => void;
  onTrade: (indices: [number, number, number]) => void;
  onSkipDraft: () => void;
  onAttackSingle: () => void;
  onAttackBlitz: () => void;
  onEndAttack: () => void;
  onAttackCancel: () => void;
  onFortifyConfirm: (count: number) => void;
  onFortifySkip: () => void;
}

/**
 * Scrollable sidebar host. Switches the phase-hero panel based on UIPhase.
 * CommanderCard, PowersList, IntelFeed are always visible.
 */
export function Dossier({
  state,
  humanPlayerId,
  selected,
  target,
  attackDice,
  defenseDice,
  onDeployConfirm,
  onDeployCancel,
  onTrade,
  onSkipDraft,
  onAttackSingle,
  onAttackBlitz,
  onEndAttack,
  onAttackCancel,
  onFortifyConfirm,
  onFortifySkip,
}: DossierProps) {
  const player = state.players.find((p) => p.id === humanPlayerId);
  const phase = uiPhase(state, humanPlayerId);

  const isHumanTurn =
    state.players[state.currentPlayerIdx]?.id === humanPlayerId;

  return (
    <div className="flex h-full flex-col overflow-y-auto" aria-label="dossier">
      {/* Commander card — always visible */}
      <CommanderCard
        name={player?.name ?? 'Commander'}
        tag={`${phase} · ${state.phase.toUpperCase()}`}
        color={player?.color ?? 'var(--neu)'}
      />

      {/* Phase hero — only show when it's human's turn */}
      {isHumanTurn && (
        <>
          {phase === 'Draft' && (
            <DraftPanel
              state={state}
              humanPlayerId={humanPlayerId}
              onTrade={onTrade}
              onSkip={onSkipDraft}
            />
          )}

          {phase === 'Deploy' && state.phase === 'reinforce' && (
            <DeployPanel
              state={state}
              humanPlayerId={humanPlayerId}
              selected={selected}
              onConfirm={onDeployConfirm}
              onCancel={onDeployCancel}
            />
          )}

          {phase === 'Attack' && (
            <>
              <AttackPanel
                state={state}
                humanPlayerId={humanPlayerId}
                selected={selected}
                target={target}
                onSingle={onAttackSingle}
                onBlitz={onAttackBlitz}
                onEndAttack={onEndAttack}
                onCancel={onAttackCancel}
              />
              <DicePanel attackDice={attackDice} defenseDice={defenseDice} />
            </>
          )}

          {phase === 'Fortify' && (
            <FortifyPanel
              state={state}
              humanPlayerId={humanPlayerId}
              selected={selected}
              target={target}
              onConfirm={onFortifyConfirm}
              onSkip={onFortifySkip}
            />
          )}
        </>
      )}

      {/* Powers list — always visible */}
      <PowersList state={state} humanPlayerId={humanPlayerId} />

      {/* Intel feed — always visible */}
      <IntelFeed state={state} />
    </div>
  );
}
