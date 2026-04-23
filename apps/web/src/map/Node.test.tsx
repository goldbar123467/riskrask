import { apply, createInitialState, playerId } from '@riskrask/engine';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Map as GameMap } from './Map';
import { Node } from './Node';

function makeState() {
  // Create a state where Alaska is owned by p1, Kamchatka by p2 (adjacent via edge)
  // We'll use a real game state after setup
  const state = createInitialState({
    seed: 'map-test',
    players: [
      { id: playerId('p1'), name: 'Human', color: '#4f7dd4', isAI: false },
      { id: playerId('p2'), name: 'AI', color: '#c94a4a', isAI: true },
      { id: playerId('p3'), name: 'AI2', color: '#d4a24a', isAI: true },
    ],
  });
  return state;
}

describe('Map node click interactions', () => {
  it('renders the map without crashing', () => {
    const state = makeState();
    render(
      <svg aria-label="test-map" role="img">
        <title>Test Map</title>
        <GameMap
          state={state}
          humanPlayerId="p1"
          isYourTurn={true}
          selected={null}
          target={null}
          onSelect={vi.fn()}
          onHover={vi.fn()}
        />
      </svg>,
    );
    expect(screen.getByLabelText('game-map')).toBeInTheDocument();
  });

  it('calls onSelect when a territory node is clicked', async () => {
    const state = makeState();
    const onSelect = vi.fn();

    render(
      <svg aria-label="test-map-2" role="img">
        <title>Test Map 2</title>
        <GameMap
          state={state}
          humanPlayerId="p1"
          isYourTurn={true}
          selected={null}
          target={null}
          onSelect={onSelect}
          onHover={vi.fn()}
        />
      </svg>,
    );

    // In setup-claim phase, all territories are clickable
    const alaska = document.querySelector('[data-territory="Alaska"]');
    if (alaska) {
      await userEvent.click(alaska);
      expect(onSelect).toHaveBeenCalledWith('Alaska');
    }
  });

  it('renders an SVG <title> tooltip with territory, army count, and adjacency', () => {
    const state = makeState();
    render(
      <svg aria-label="tooltip-map" role="img">
        <title>Tooltip Map</title>
        <GameMap
          state={state}
          humanPlayerId="p1"
          isYourTurn={true}
          selected={null}
          target={null}
          onSelect={vi.fn()}
          onHover={vi.fn()}
        />
      </svg>,
    );

    const alaska = document.querySelector('[data-territory="Alaska"]');
    expect(alaska).not.toBeNull();
    const title = alaska?.querySelector('title');
    expect(title).not.toBeNull();
    const text = title?.textContent ?? '';
    // Territory name present
    expect(text).toContain('Alaska');
    // Army count present
    const alaskaTerr = state.territories.Alaska;
    expect(alaskaTerr).toBeDefined();
    expect(text).toContain(String(alaskaTerr?.armies ?? 0));
    // At least one real Alaska neighbour (classic board: Kamchatka, Alberta, Northwest Territory)
    const hasNeighbour =
      text.includes('Kamchatka') ||
      text.includes('Alberta') ||
      text.includes('Northwest Territory');
    expect(hasNeighbour).toBe(true);
  });
});

describe('Node memoization', () => {
  it('is wrapped in React.memo so parent re-renders with identical props skip reconciliation', () => {
    // React.memo-wrapped components expose a $$typeof symbol whose description
    // contains "react.memo". A plain function component does not.
    const typed = Node as unknown as { $$typeof?: symbol };
    const typeofDesc = typed.$$typeof?.toString() ?? '';
    expect(typeofDesc).toContain('react.memo');
  });
});
