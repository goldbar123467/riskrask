import type { GameState, TerritoryName } from '@riskrask/engine';
import { useEffect, useRef } from 'react';
import { uiPhase } from '../game/phase';
import { AttackPanel } from './AttackPanel';
import { CommanderCard } from './CommanderCard';
import { DeployPanel } from './DeployPanel';
import { DicePanel } from './DicePanel';
import { DraftPanel } from './DraftPanel';
import { FortifyPanel } from './FortifyPanel';
import { IntelFeed } from './IntelFeed';
import { PowersList } from './PowersList';
import { ArmyPanel } from './panels/ArmyPanel';
import { DiplPanel } from './panels/DiplPanel';
import { HelpPanel } from './panels/HelpPanel';
import { IntelPanel } from './panels/IntelPanel';
import { LogPanel } from './panels/LogPanel';

export type DossierTab = 'map' | 'army' | 'intel' | 'dipl' | 'log' | 'help';

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
  activeTab?: DossierTab;
}

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
  activeTab = 'map',
}: DossierProps) {
  const player = state.players.find((p) => p.id === humanPlayerId);
  const phase = uiPhase(state, humanPlayerId, draftSkipped);
  const currentPlayer = state.players[state.currentPlayerIdx];
  const isHumanTurn = currentPlayer?.id === humanPlayerId;
  const waitingFor = !isHumanTurn && currentPlayer ? currentPlayer.name : null;

  // Scroll the sidebar back to the top whenever the rail tab switches. Without
  // this the user can click e.g. Army, have the panel swap, but still be
  // scrolled to where the previous tab's content sat — makes the click feel
  // dead when the new panel is entirely above the current viewport.
  const scrollRef = useRef<HTMLDivElement | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: activeTab is the intended trigger; its value isn't read inside the effect.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [activeTab]);

  const TAB_LABEL: Record<DossierTab, string> = {
    map: '01 · COMMAND',
    army: '02 · ARMY',
    intel: '03 · INTEL',
    dipl: '04 · DIPLOMACY',
    log: '05 · LOG',
    help: '06 · HELP',
  };

  return (
    <div
      ref={scrollRef}
      className="flex h-full flex-col overflow-y-auto"
      aria-label="dossier"
      data-tab={activeTab}
    >
      <div
        className="flex items-center justify-between border-b border-line bg-bg-1 px-4 py-2 font-mono text-[9px] uppercase tracking-[0.24em] text-hot"
        aria-label="dossier-tab-banner"
      >
        <span>{TAB_LABEL[activeTab]}</span>
        <span className="text-ink-faint">T-{String(state.turn + 1).padStart(3, '0')}</span>
      </div>
      <CommanderCard
        name={player?.name ?? 'Commander'}
        tag={`${phase} · ${state.phase.toUpperCase()}`}
        color={player?.color ?? 'var(--neu)'}
        waitingFor={waitingFor}
      />

      {activeTab === 'map' && (
        <>
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
          <PowersList state={state} humanPlayerId={humanPlayerId} />
          <IntelFeed state={state} />
        </>
      )}

      {activeTab === 'army' && <ArmyPanel state={state} humanPlayerId={humanPlayerId} />}
      {activeTab === 'intel' && <IntelPanel state={state} humanPlayerId={humanPlayerId} />}
      {activeTab === 'dipl' && <DiplPanel state={state} humanPlayerId={humanPlayerId} />}
      {activeTab === 'log' && <LogPanel humanPlayerId={humanPlayerId} />}
      {activeTab === 'help' && <HelpPanel />}
    </div>
  );
}
