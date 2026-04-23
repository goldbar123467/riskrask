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
  deployCount: number;
  onDeployCountChange: (count: number) => void;
  onDeployConfirm: (count: number) => void;
  onDeployCancel: () => void;
  onTrade: (indices: [number, number, number]) => void;
  onSkipDraft: () => void;
  onAttackSingle: () => void;
  onAttackBlitz: () => void;
  onEndAttack: () => void;
  onAttackCancel: () => void;
  onFortifyConfirm: (count: number) => void;
  onFortifySkip: () => void;
  draftSkipped?: boolean;
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
  deployCount,
  onDeployCountChange,
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
  draftSkipped = false,
}: DossierProps) {
  const player = state.players.find((p) => p.id === humanPlayerId);
  const phase = uiPhase(state, humanPlayerId, draftSkipped);

  const isHumanTurn = state.players[state.currentPlayerIdx]?.id === humanPlayerId;

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
          {/* Forced trade always takes priority; render the DraftPanel so the
              player has a tradeable-set surface even when the modal hasn't
              fully mounted. */}
          {phase === 'Draft' && (
            <DraftPanel
              state={state}
              humanPlayerId={humanPlayerId}
              onTrade={onTrade}
              onSkip={onSkipDraft}
            />
          )}

          {/* DeployPanel is valid throughout reinforce phase. The engine
              auto-advances to attack when reserves hit 0, so reserves>0 is
              implied — but we still render the panel when state.phase is
              reinforce so the user sees the current deploy surface even if
              a draft panel is also visible. */}
          {state.phase === 'reinforce' && (
            <DeployPanel
              state={state}
              humanPlayerId={humanPlayerId}
              selected={selected}
              count={deployCount}
              onCountChange={onDeployCountChange}
              onConfirm={onDeployConfirm}
              onCancel={onDeployCancel}
            />
          )}

          {state.phase === 'attack' && (
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

          {state.phase === 'fortify' && (
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
