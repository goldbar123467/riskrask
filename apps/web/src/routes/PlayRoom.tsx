/**
 * Multiplayer play route.
 *
 * Mounted by `Play` when the route is `/play/:roomId`. Solo behaviour lives in
 * `PlaySolo`; this component is the seam where `useRoomDispatcher` drives
 * server-authoritative play.
 *
 * Flow on mount:
 *  1. Read JWT from `useAuth`. If absent, redirect to `/lobby/${roomId}` so
 *     the paste-a-token panel has somewhere to land.
 *  2. `GET /api/rooms/:id` → resolve our seat index from the seats list. If we
 *     aren't seated, redirect back to the lobby (user landed on this URL
 *     without joining).
 *  3. Mount `useRoomDispatcher` with the resolved seat. It opens the WS,
 *     hydrates the zustand store from `welcome`, and re-runs the reducer on
 *     every `applied` frame.
 *
 * Click handlers never mutate local state directly — they send an `intent`
 * frame; the server validates and echoes back `applied`, which the dispatcher
 * funnels through the local reducer. This is the optimistic pattern's
 * pessimistic sibling: one round-trip per click in v1; optimistic echo is
 * v1.1.
 */

import type { Action, TerritoryName } from '@riskrask/engine';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Brand } from '../console/Brand';
import { Rail } from '../console/Rail';
import { ResponsiveShell } from '../console/ResponsiveShell';
import { Statusbar } from '../console/Statusbar';
import { Topbar } from '../console/Topbar';
import { Dossier } from '../dossier/Dossier';
import { uiPhase } from '../game/phase';
import { useGame } from '../game/useGame';
import { useRoomDispatcher } from '../game/useRoomDispatcher';
import { useHotkeys } from '../hooks/useHotkey';
import { ForcedTradeModal } from '../modals/ForcedTradeModal';
import { MoveModal } from '../modals/MoveModal';
import { VictoryModal } from '../modals/VictoryModal';
import { getRoom } from '../net/api';
import { useAuth } from '../net/auth';
import { Stage } from '../stage/Stage';

interface PlayRoomProps {
  roomId: string;
}

type Resolution =
  | { kind: 'loading' }
  | { kind: 'redirect'; to: string }
  | { kind: 'ready'; seatIdx: number; humanPlayerId: string };

export function PlayRoom({ roomId }: PlayRoomProps) {
  const navigate = useNavigate();
  const { token, userId } = useAuth();

  const [resolution, setResolution] = useState<Resolution>({ kind: 'loading' });

  useEffect(() => {
    if (!token || !userId) {
      setResolution({ kind: 'redirect', to: `/lobby/${roomId}` });
      return;
    }
    let cancelled = false;
    void (async () => {
      const res = await getRoom(roomId, token);
      if (cancelled) return;
      if (!res.ok) {
        setResolution({ kind: 'redirect', to: `/lobby/${roomId}` });
        return;
      }
      const seats = res.data.room.seats ?? [];
      const mine = seats.find((s) => s.userId === userId);
      if (!mine) {
        setResolution({ kind: 'redirect', to: `/lobby/${roomId}` });
        return;
      }
      setResolution({ kind: 'ready', seatIdx: mine.seatIdx, humanPlayerId: userId });
    })();
    return () => {
      cancelled = true;
    };
  }, [roomId, token, userId]);

  useEffect(() => {
    if (resolution.kind === 'redirect') {
      void navigate(resolution.to, { replace: true });
    }
  }, [resolution, navigate]);

  if (resolution.kind !== 'ready' || !token) {
    return null;
  }

  return (
    <PlayRoomInner
      roomId={roomId}
      seatIdx={resolution.seatIdx}
      humanPlayerId={resolution.humanPlayerId}
      token={token}
    />
  );
}

// ---------------------------------------------------------------------------
// Inner — hooks that depend on resolved seatIdx live here so they mount once
// and unmount cleanly when the caller redirects.
// ---------------------------------------------------------------------------

interface InnerProps {
  roomId: string;
  seatIdx: number;
  humanPlayerId: string;
  token: string;
}

function PlayRoomInner({ roomId, seatIdx, humanPlayerId, token }: InnerProps) {
  const state = useGame((s) => s.state);
  const selected = useGame((s) => s.selected);
  const hoverTarget = useGame((s) => s.hoverTarget);
  const setSelected = useGame((s) => s.setSelected);
  const setHover = useGame((s) => s.setHover);

  const { connState, sendIntent, lastError } = useRoomDispatcher({
    roomId,
    seatIdx,
    token,
  });

  const [target, setTarget] = useState<TerritoryName | null>(null);
  const [activeRailItem, setActiveRailItem] = useState<
    'map' | 'army' | 'intel' | 'dipl' | 'log' | 'help'
  >('map');
  const [attackDice, setAttackDice] = useState<readonly number[]>([]);
  const [defenseDice, setDefenseDice] = useState<readonly number[]>([]);

  // Server controls phase progression, so the draft-skipped escape hatch from
  // solo doesn't apply here. `uiPhase` is called with `draftSkipped=false`.
  const phase = state ? uiPhase(state, humanPlayerId, false) : 'Setup';

  // Consume dice-roll effects pushed by the dispatcher when it re-runs the
  // reducer on `applied`. Same effect queue as solo — no divergence.
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
          sendIntent({ type: 'claim-territory', territory: name });
        }
        return;
      }

      if (state.phase === 'setup-reinforce') {
        if (terr.owner === humanPlayerId) {
          sendIntent({ type: 'setup-reinforce', territory: name });
        }
        return;
      }

      if (state.phase === 'attack') {
        if (selected && terr.owner !== humanPlayerId && terr.owner !== null) {
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
    [state, humanPlayerId, selected, sendIntent, setSelected],
  );

  function emit(action: Action): void {
    sendIntent(action);
  }

  function handleDeployConfirm() {
    if (!state || !selected) return;
    const player = state.players.find((p) => p.id === humanPlayerId);
    if (!player || player.reserves <= 0) return;
    emit({ type: 'reinforce', territory: selected, count: player.reserves });
    setSelected(null);
  }

  function handleDeployCancel() {
    setSelected(null);
  }

  function handleTrade(indices: [number, number, number]) {
    emit({ type: 'trade-cards', indices });
  }

  function handleAttackSingle() {
    if (!state || !selected || !target) return;
    emit({ type: 'attack', from: selected, to: target });
    setTarget(null);
  }

  function handleAttackBlitz() {
    if (!state || !selected || !target) return;
    emit({ type: 'attack-blitz', from: selected, to: target });
    setTarget(null);
  }

  function handleEndAttack() {
    emit({ type: 'end-attack-phase' });
    setSelected(null);
    setTarget(null);
  }

  function handleAttackCancel() {
    setSelected(null);
    setTarget(null);
  }

  function handleFortifyConfirm(count: number) {
    if (!state || !selected || !target) return;
    emit({ type: 'fortify', from: selected, to: target, count });
    setSelected(null);
    setTarget(null);
  }

  function handleFortifySkip() {
    emit({ type: 'end-turn' });
    setSelected(null);
    setTarget(null);
  }

  function handleMoveConfirm(count: number) {
    emit({ type: 'move-after-capture', count });
  }

  function handleMoveCancel() {
    if (!state?.pendingMove) return;
    emit({ type: 'move-after-capture', count: state.pendingMove.min });
  }

  // Hotkeys — parity with solo so players don't retrain their hands.
  useHotkeys(
    // biome-ignore lint/correctness/useExhaustiveDependencies: handlers are inline; stable via state/selected/target
    useMemo(
      () => ({
        ' ': () => {
          if (!state) return;
          if (state.phase === 'reinforce' && selected) handleDeployConfirm();
          else if (state.phase === 'attack' && selected && target) handleAttackBlitz();
        },
        Escape: () => {
          setSelected(null);
          setTarget(null);
        },
      }),
      [state, selected, target],
    ),
  );

  if (!state) {
    return (
      <main className="flex h-full min-h-screen flex-col items-center justify-center gap-3 bg-bg-0">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-ghost">
          {connState === 'connecting' || connState === 'reconnecting'
            ? 'Connecting…'
            : 'Awaiting welcome…'}
        </p>
        {lastError && (
          <p className="font-mono text-[9px] text-danger">
            {lastError.code}
            {lastError.detail ? `: ${lastError.detail}` : ''}
          </p>
        )}
      </main>
    );
  }

  const cp = state.players[state.currentPlayerIdx];

  return (
    <>
      <ResponsiveShell
        brand={<Brand />}
        topbar={
          <Topbar
            session={`ROOM · #${seatIdx}`}
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
            onSkipDraft={() => {
              /* draft-skip is a solo-only escape hatch; server drives MP phases */
            }}
            draftSkipped={false}
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
            link={connState === 'open' ? 'stable' : connState === 'closed' ? 'down' : 'lagging'}
            tickLabel={`T-${String(state.turn + 1).padStart(3, '0')}`}
            latencyMs={0}
            windowLabel={cp ? cp.name : '—'}
          />
        }
      />

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
          onCancel={() => {
            /* forced trade cannot be skipped */
          }}
        />
      )}

      {state.phase === 'done' && state.winner && (
        <VictoryModal
          state={state}
          onRematch={() => {
            /* host-triggered relaunch is the MP rematch path; button is hidden */
          }}
          mode="room"
          roomId={roomId}
        />
      )}
    </>
  );
}
