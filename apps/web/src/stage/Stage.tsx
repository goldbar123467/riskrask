import type { GameState, TerritoryName } from '@riskrask/engine';
import { useRef, useState } from 'react';
import { TransformComponent, TransformWrapper, useControls } from 'react-zoom-pan-pinch';
import { AiTurnOverlay } from '../components/AiTurnOverlay';
import type { UIPhase } from '../game/phase';
import { Map as GameMap } from '../map/Map';
import { PhaseTabs } from './PhaseTabs';
import { StageHud } from './StageHud';
import { ZoomControl } from './ZoomControl';

interface StageProps {
  state: GameState;
  humanPlayerId: string;
  currentPhase: UIPhase;
  selected: TerritoryName | null;
  target: TerritoryName | null;
  hover: TerritoryName | null;
  onSelect: (name: TerritoryName) => void;
  onHover: (name: TerritoryName | null) => void;
  /**
   * `'solo'` (default) shows the AI-turn overlay while it's an AI's turn.
   * `'room'` suppresses it — every non-human seat in multiplayer is a remote
   * commander, not a local AI, and the overlay would mis-label them.
   */
  mode?: 'solo' | 'room';
}

/**
 * Map host: zoom/pan wrapper + corner HUDs + phase tabs + zoom control.
 */
export function Stage({
  state,
  humanPlayerId,
  currentPhase,
  selected,
  target,
  hover,
  onSelect,
  onHover,
  mode = 'solo',
}: StageProps) {
  const [scale, setScale] = useState(1);
  const cp = state.players[state.currentPlayerIdx];
  const aiTurn =
    mode === 'solo' &&
    !!cp &&
    cp.isAI === true &&
    cp.id !== humanPlayerId &&
    state.phase !== 'done' &&
    state.phase !== 'setup-claim' &&
    state.phase !== 'setup-reinforce';

  return (
    <div
      className="relative h-full w-full overflow-hidden"
      style={{
        background: 'radial-gradient(circle at 50% 45%, #0d1118 0%, #06070a 65%)',
      }}
    >
      {/* Grid background */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(rgba(80,100,140,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(80,100,140,0.04) 1px, transparent 1px)',
          backgroundSize: '80px 80px',
          maskImage: 'radial-gradient(ellipse 90% 80% at center, #000 50%, transparent 100%)',
        }}
      />

      {/* Phase tabs */}
      <PhaseTabs
        currentPhase={currentPhase}
        isHumanTurn={state.players[state.currentPlayerIdx]?.id === humanPlayerId}
      />

      {/* Corner HUDs */}
      <StageHud state={state} hover={hover} />

      {/* Zoom/pan map */}
      <TransformWrapper
        initialScale={1}
        minScale={0.4}
        maxScale={4}
        centerOnInit
        limitToBounds={false}
        /* Disable double-click-to-zoom — in Deploy, players tap territories
           fast and the default zoom-in was fighting clicks for control. */
        doubleClick={{ disabled: true }}
        /* Drop the post-release fling so a quick click never carries the map
           into a drift after it. */
        panning={{ velocityDisabled: true }}
        wheel={{ step: 0.15 }}
        onTransformed={(_ref, stateObj) => {
          if (typeof stateObj.scale === 'number') setScale(stateObj.scale);
        }}
      >
        <ZoomInner
          state={state}
          humanPlayerId={humanPlayerId}
          selected={selected}
          target={target}
          currentPhase={currentPhase}
          scale={scale}
          onSelect={onSelect}
          onHover={onHover}
        />
      </TransformWrapper>

      {/* AI-turn overlay — pointer-events: none means hover/zoom still work
          on the map layer beneath. Only mounted in solo mode. */}
      <AiTurnOverlay
        active={aiTurn}
        name={cp?.name ?? 'AI'}
        {...(cp?.color ? { color: cp.color } : {})}
      />
    </div>
  );
}

interface ZoomInnerProps {
  state: GameState;
  humanPlayerId: string;
  selected: TerritoryName | null;
  target: TerritoryName | null;
  currentPhase: UIPhase;
  scale: number;
  onSelect: (name: TerritoryName) => void;
  onHover: (name: TerritoryName | null) => void;
}

function ZoomInner({
  state,
  humanPlayerId,
  selected,
  target,
  currentPhase,
  scale,
  onSelect,
  onHover,
}: ZoomInnerProps) {
  const { zoomIn, zoomOut, resetTransform } = useControls();
  const wrapRef = useRef<HTMLDivElement>(null);

  return (
    <>
      <TransformComponent
        wrapperStyle={{ width: '100%', height: '100%' }}
        contentStyle={{ width: '100%', height: '100%' }}
      >
        <div ref={wrapRef} style={{ width: '100%', height: '100%', minHeight: '400px' }}>
          <GameMap
            state={state}
            humanPlayerId={humanPlayerId}
            selected={selected}
            target={target}
            onSelect={onSelect}
            onHover={onHover}
          />
        </div>
      </TransformComponent>

      <ZoomControl
        onZoomIn={() => zoomIn()}
        onZoomOut={() => zoomOut()}
        onFit={() => resetTransform()}
        scale={scale}
        disabled={currentPhase === 'Setup'}
      />
    </>
  );
}
