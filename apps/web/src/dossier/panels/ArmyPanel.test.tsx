import { createInitialState } from '@riskrask/engine';
import type { GameState } from '@riskrask/engine';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ArmyPanel } from './ArmyPanel';

/**
 * Seeds a deterministic 3-player state and then bulk-rewrites territory
 * owners + armies to hit the branches this panel cares about:
 *   - Alice holds all of Australia (continent bonus).
 *   - Bob holds part of North America.
 *   - Carol holds a single scrap in Asia.
 * currentPlayerIdx defaults to 0 (Alice) unless the test overrides it.
 */
function seedState(overrides?: Partial<GameState>): GameState {
  const base = createInitialState({
    seed: 'army-panel-test',
    players: [
      { id: 'p0', name: 'Alice', color: '#dc2626', isAI: false },
      { id: 'p1', name: 'Bob', color: '#2563eb', isAI: true },
      { id: 'p2', name: 'Carol', color: '#059669', isAI: true },
    ],
  });

  const territories = { ...base.territories } as Record<string, GameState['territories'][string]>;

  // Alice: all 4 Australia members (continent held) + 1 extra in SA
  const aliceTerrs: Array<[string, number]> = [
    ['Indonesia', 3],
    ['New Guinea', 2],
    ['Western Australia', 5],
    ['Eastern Australia', 1],
    ['Brazil', 4],
  ];
  for (const [name, armies] of aliceTerrs) {
    const t = territories[name];
    if (!t) throw new Error(`missing territory ${name}`);
    territories[name] = { ...t, owner: 'p0', armies };
  }

  // Bob: partial North America
  const bobTerrs: Array<[string, number]> = [
    ['Alaska', 2],
    ['Alberta', 2],
    ['Ontario', 1],
  ];
  for (const [name, armies] of bobTerrs) {
    const t = territories[name];
    if (!t) throw new Error(`missing territory ${name}`);
    territories[name] = { ...t, owner: 'p1', armies };
  }

  // Carol: single Asian territory
  const carolTerrs: Array<[string, number]> = [['China', 1]];
  for (const [name, armies] of carolTerrs) {
    const t = territories[name];
    if (!t) throw new Error(`missing territory ${name}`);
    territories[name] = { ...t, owner: 'p2', armies };
  }

  const players = base.players.map((p) => {
    if (p.id === 'p0') return { ...p, reserves: 3 };
    if (p.id === 'p1') return { ...p, reserves: 5 };
    if (p.id === 'p2') return { ...p, reserves: 0, eliminated: false };
    return p;
  });

  return {
    ...base,
    phase: 'attack',
    turn: 4,
    currentPlayerIdx: 0,
    players,
    territories,
    ...overrides,
  } as GameState;
}

describe('ArmyPanel', () => {
  it('renders the global overview header with turn, phase, and claimed count', () => {
    const state = seedState();
    render(<ArmyPanel state={state} humanPlayerId="p0" />);

    const overview = screen.getByLabelText('army-overview');
    // 5 (Alice) + 3 (Bob) + 1 (Carol) = 9 claimed of 42.
    expect(overview).toHaveTextContent('9 / 42');
    expect(overview).toHaveTextContent('Turn');
    expect(overview).toHaveTextContent('5'); // turn index 4 → display "5"
    expect(overview).toHaveTextContent('Attack');
  });

  it('orders the current player first, then others by territory count desc', () => {
    // Bob is current → should appear first. Alice (5 terrs) beats Carol (1 terr).
    const state = seedState({ currentPlayerIdx: 1 });
    render(<ArmyPanel state={state} humanPlayerId="p0" />);

    const roster = screen.getByLabelText('army-roster');
    // Filter to only the top-level roster cards (each has data-player-id);
    // continent rows are nested listitems inside the cards.
    const rows = within(roster)
      .getAllByRole('listitem')
      .filter((el) => el.hasAttribute('data-player-id'));
    const ids = rows.map((el) => el.getAttribute('data-player-id') ?? '');
    expect(ids).toEqual(['p1', 'p0', 'p2']);

    // Current marker propagates to the data attribute.
    expect(rows[0]?.getAttribute('data-current')).toBe('true');
    expect(rows[1]?.getAttribute('data-current')).toBe('false');
    expect(rows[2]?.getAttribute('data-current')).toBe('false');
  });

  it('renders continent breakdown with a held marker when Alice owns Australia', () => {
    const state = seedState();
    render(<ArmyPanel state={state} humanPlayerId="p0" />);

    const aliceContinents = screen.getByLabelText('continents-p0');
    // Alice owns Australia fully (4/4) and 1/4 of South America.
    const auItem = within(aliceContinents).getByText('Australia').closest('li');
    expect(auItem).not.toBeNull();
    expect(auItem?.getAttribute('data-held')).toBe('true');
    expect(auItem).toHaveTextContent('4/4');
    expect(within(auItem as HTMLElement).getByLabelText('continent-held')).toBeInTheDocument();

    const saItem = within(aliceContinents).getByText('South America').closest('li');
    expect(saItem).not.toBeNull();
    expect(saItem?.getAttribute('data-held')).toBe('false');
    expect(saItem).toHaveTextContent('1/4');

    // Bob's continent row shows partial ownership without the held marker.
    const bobContinents = screen.getByLabelText('continents-p1');
    const naItem = within(bobContinents).getByText('North America').closest('li');
    expect(naItem).not.toBeNull();
    expect(naItem?.getAttribute('data-held')).toBe('false');
    expect(naItem).toHaveTextContent('3/9');
  });

  it('masks card count for opponents and shows exact count for the human', () => {
    const state = seedState();
    // Hand-inject a card into Bob's hand so there is something to hide.
    const doctored: GameState = {
      ...state,
      players: state.players.map((p) =>
        p.id === 'p1' ? { ...p, cards: [{ territory: 'Alaska', type: 'Infantry' as const }] } : p,
      ),
    };
    render(<ArmyPanel state={doctored} humanPlayerId="p0" />);

    const aliceRow = screen.getByLabelText('army-row-p0');
    expect(within(aliceRow).getByText('Cards')).toBeInTheDocument();
    // Alice has 0 cards but the panel still renders the exact number.
    expect(within(aliceRow).getAllByText('0').length).toBeGreaterThan(0);

    const bobRow = screen.getByLabelText('army-row-p1');
    expect(within(bobRow).getByText('?')).toBeInTheDocument();
  });

  it('flags eliminated players and does not list Neutral as a roster row', () => {
    const state = seedState();
    const with2p = createInitialState({
      seed: 'army-panel-neutral',
      players: [
        { id: 'p0', name: 'Alice', color: '#dc2626', isAI: false },
        { id: 'p1', name: 'Bob', color: '#2563eb', isAI: true },
      ],
    });
    // 2-player mode spawns a Neutral seat — confirm it is filtered out.
    render(<ArmyPanel state={with2p} humanPlayerId="p0" />);
    const roster = screen.getByLabelText('army-roster');
    const rows = within(roster)
      .getAllByRole('listitem')
      .filter((el) => el.hasAttribute('data-player-id'));
    const ids = rows.map((el) => el.getAttribute('data-player-id') ?? '');
    expect(ids).toEqual(['p0', 'p1']);

    // Eliminated state.
    const withElim: GameState = {
      ...state,
      players: state.players.map((p) => (p.id === 'p2' ? { ...p, eliminated: true } : p)),
    };
    const { rerender } = render(<ArmyPanel state={withElim} humanPlayerId="p0" />);
    rerender(<ArmyPanel state={withElim} humanPlayerId="p0" />);
    const carolRow = screen.getAllByLabelText('army-row-p2')[0];
    expect(carolRow).toBeDefined();
    expect(carolRow?.getAttribute('data-eliminated')).toBe('true');
    expect(within(carolRow as HTMLElement).getByText('eliminated')).toBeInTheDocument();
  });
});
