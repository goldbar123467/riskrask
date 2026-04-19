import type { Action, Effect, TerritoryName } from '@riskrask/engine';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Brand } from '../console/Brand';
import { Rail } from '../console/Rail';
import { Shell } from '../console/Shell';
import { Statusbar } from '../console/Statusbar';
import { Topbar } from '../console/Topbar';
import { Dossier } from '../dossier/Dossier';
import { uiPhase } from '../game/phase';
import { useGame } from '../game/useGame';
import { useSoloDispatcher } from '../game/useSoloDispatcher';
import { ForcedTradeModal } from '../modals/ForcedTradeModal';
import { MoveModal } from '../modals/MoveModal';
import { VictoryModal } from '../modals/VictoryModal';
import { Stage } from '../stage/Stage';

/**
 * Live Console shell for the play route.
 * Wires together Shell + Stage + Dossier + modals.
 * Multiplayer socket left as seam for Track F.
 */
export function Play() {
  const navigate = useNavigate();
  const state = useGame((s) => s.state);
  const selected = useGame((s) => s.selected);
  const hoverTarget = useGame((s) => s.hoverTarget);
  const dispatch = useGame((s) => s.dispatch);
  const setSelected = useGame((s) => s.setSelected);
  const setHover = useGame((s) => s.setHover);
  const loadState = useGame((s) => s.loadState);

  const [target, setTarget] = useState<TerritoryName | null>(null);
  const [activeRailItem, setActiveRailItem] = useState<
    'map' | 'army' | 'intel' | 'dipl' | 'log' | 'help'
  >('map');
  const [attackDice, setAttackDice] = useState<readonly number[]>([]);
  const [defenseDice, setDefenseDice] = useState<readonly number[]>([]);

  // Human player is always index 0 in solo mode
  const humanPlayerId = state?.players[0]?.id ?? 'human';

  // Run AI turns
  useSoloDispatcher(humanPlayerId);

  // Redirect if no state loaded
  useEffect(() => {
    if (!state) void navigate('/');
  }, [state, navigate]);

  // Consume dice-roll effects
  const effectsQueue = useGame((s) => s.effectsQueue);
  const shiftEffect = useGame((s) => s.shiftEffect);
  const effectsRef = useRef(effectsQueue);
  effectsRef.current = effectsQueue;

  useEffect(() => {
    if (effectsQueue.length === 0) return;
    const effect = effectsQueue[0];
    if (!effect) return;
    if (effect.kind === 'dice-roll') {
      setAttackDice(effect.atk);
      setDefenseDice(effect.def);
    }
    shiftEffect();
  }, [effectsQueue, shiftEffect]);

  const handleSelect = useCallback(
    (name: TerritoryName) => {
      if (!state) return;
      const terr = state.territories[name];
      if (!terr) return;

      const cp = state.players[state.currentPlayerIdx];
      if (!cp || cp.id !== humanPlayerId) return;

      if (state.phase === 'setup-claim') {
        if (terr.owner === null) {
          const effects = dispatch({ type: 'claim-territory', territory: name });
          void effects;
        }
        return;
      }

      if (state.phase === 'setup-reinforce') {
        if (terr.owner === humanPlayerId) {
          dispatch({ type: 'setup-reinforce', territory: name });
        }
        return;
      }

      if (state.phase === 'attack') {
        if (selected && terr.owner !== humanPlayerId && terr.owner !== null) {
          // Check adjacency
          const srcTerr = state.territories[selected];
          if (srcTerr?.adj.includes(name)) {
            setTarget(name);
            return;
          }
        }
        if (terr.owner === humanPlayerId && terr.armies >= 2) {
          setSelected(name);
          setTarget(null);
          return;
        }
        return;
      }

      if (state.phase === 'fortify') {
        if (!selected) {
          if (terr.owner === humanPlayerId) setSelected(name);
        } else {
          if (terr.owner === humanPlayerId && name !== selected) {
            setTarget(name);
          } else {
            setSelected(name);
            setTarget(null);
          }
        }
        return;
      }

      if (state.phase === 'reinforce') {
        if (terr.owner === humanPlayerId) {
          setSelected(name);
        }
      }
    },
    [state, humanPlayerId, selected, dispatch, setSelected],
  );

  function safeDispatch(action: Action): Effect[] {
    try {
      return dispatch(action);
    } catch {
      return [];
    }
  }

  function handleDeployConfirm() {
    if (!state || !selected) return;
    const player = state.players.find((p) => p.id === humanPlayerId);
    if (!player || player.reserves <= 0) return;
    safeDispatch({ type: 'reinforce', territory: selected, count: player.reserves });
    setSelected(null);
  }

  function handleDeployCancel() {
    setSelected(null);
  }

  function handleTrade(indices: [number, number, number]) {
    safeDispatch({ type: 'trade-cards', indices });
  }

  function handleAttackSingle() {
    if (!state || !selected || !target) return;
    safeDispatch({ type: 'attack', from: selected, to: target });
  }

  function handleAttackBlitz() {
    if (!state || !selected || !target) return;
    const effects = safeDispatch({ type: 'attack-blitz', from: selected, to: target });
    void effects;
    setTarget(null);
  }

  function handleEndAttack() {
    safeDispatch({ type: 'end-attack-phase' });
    setSelected(null);
    setTarget(null);
  }

  function handleAttackCancel() {
    setSelected(null);
    setTarget(null);
  }

  function handleFortifyConfirm(count: number) {
    if (!state || !selected || !target) return;
    safeDispatch({ type: 'fortify', from: selected, to: target, count });
    setSelected(null);
    setTarget(null);
  }

  function handleFortifySkip() {
    safeDispatch({ type: 'end-turn' });
    setSelected(null);
    setTarget(null);
  }

  function handleMoveConfirm(count: number) {
    safeDispatch({ type: 'move-after-capture', count });
  }

  function handleMoveCancel() {
    // Move after capture is mandatory — confirm with minimum
    if (!state?.pendingMove) return;
    safeDispatch({ type: 'move-after-capture', count: state.pendingMove.min });
  }

  function handleRematch() {
    if (!state) return;
    const newState = { ...state, phase: 'setup-claim' as const, winner: undefined };
    void newState; // use createInitialState instead
    void navigate('/setup');
  }

  if (!state) return null;

  const phase = uiPhase(state, humanPlayerId);
  const cp = state.players[state.currentPlayerIdx];

  return (
    <>
      <Shell
        brand={<Brand />}
        topbar={
          <Topbar
            session="SOLO"
            turn={String(state.turn + 1)}
            phase={phase}
            clock="—"
            players={`${state.players.filter((p) => !p.eliminated).length}/${state.players.length}`}
          />
        }
        rail={<Rail activeItem={activeRailItem} onSelect={setActiveRailItem} />}
        stage={
          <Stage
            state={state}
            humanPlayerId={humanPlayerId}
            currentPhase={phase}
            selected={selected}
            target={target}
            hover={hoverTarget}
            onSelect={handleSelect}
            onHover={setHover}
          />
        }
        dossier={
          <Dossier
            state={state}
            humanPlayerId={humanPlayerId}
            selected={selected}
            target={target}
            attackDice={attackDice}
            defenseDice={defenseDice}
            onDeployConfirm={handleDeployConfirm}
            onDeployCancel={handleDeployCancel}
            onTrade={handleTrade}
            onSkipDraft={() => { /* just skip, phase heroes show deploy next */ }}
            onAttackSingle={handleAttackSingle}
            onAttackBlitz={handleAttackBlitz}
            onEndAttack={handleEndAttack}
            onAttackCancel={handleAttackCancel}
            onFortifyConfirm={handleFortifyConfirm}
            onFortifySkip={handleFortifySkip}
          />
        }
        statusbar={
          <Statusbar
            link="stable"
            tickLabel={`T-${String(state.turn + 1).padStart(3, '0')}`}
            latencyMs={0}
            windowLabel={cp ? cp.name : '—'}
          />
        }
      />

      {/* Modals */}
      {state.pendingMove && (
        <MoveModal
          pendingMove={state.pendingMove}
          onConfirm={handleMoveConfirm}
          onCancel={handleMoveCancel}
        />
      )}

      {state.pendingForcedTrade && (
        <ForcedTradeModal
          state={state}
          forcedTrade={state.pendingForcedTrade}
          onTrade={handleTrade}
          onCancel={() => { /* forced trade cannot be skipped — do nothing */ }}
        />
      )}

      {state.phase === 'done' && state.winner && (
        <VictoryModal state={state} onRematch={handleRematch} />
      )}
    </>
  );
}
