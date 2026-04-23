import type { GameState, TerritoryName } from '@riskrask/engine';
import { createInitialState } from '@riskrask/engine';
import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type LogLine, useGame } from '../../game/useGame';
import { DiplPanel, buildCaptureRows, buildContinentRows, buildThreatRows } from './DiplPanel';

function baseState(): GameState {
  return createInitialState({
    seed: 'dipl-test',
    players: [
      { id: 'p-alice', name: 'Alice', color: '#ff0000', isAI: false },
      { id: 'p-bob', name: 'Bob', color: '#00ff00', isAI: true },
      { id: 'p-carol', name: 'Carol', color: '#0000ff', isAI: true },
    ],
  });
}

/**
 * Overwrite the territory owner/army fields on a freshly minted state.
 * The engine's initial state is setup-claim with empty owners; we force a
 * deterministic board so threat-matrix math is verifiable.
 */
function forceOwners(
  state: GameState,
  assign: Readonly<Record<string, { owner: string; armies: number }>>,
): GameState {
  const next = { ...state, territories: { ...state.territories } };
  for (const [name, v] of Object.entries(assign)) {
    const t = next.territories[name as TerritoryName];
    if (!t) continue;
    next.territories[name as TerritoryName] = { ...t, owner: v.owner, armies: v.armies };
  }
  return next;
}

function seedLog(lines: readonly LogLine[]): void {
  useGame.setState({
    state: null,
    selected: null,
    hoverTarget: null,
    effectsQueue: [],
    log: [...lines],
  });
}

beforeEach(() => {
  seedLog([]);
});

afterEach(() => {
  seedLog([]);
});

describe('DiplPanel — threat matrix', () => {
  it('renders one row per non-neutral rival with active/eliminated status', () => {
    const state = baseState();
    render(<DiplPanel state={state} humanPlayerId="p-alice" />);
    const threat = screen.getByLabelText('dipl-threat');
    expect(within(threat).queryByText('Alice')).toBeNull();
    expect(screen.getByTestId('threat-row-p-bob')).toBeInTheDocument();
    expect(screen.getByTestId('threat-row-p-carol')).toBeInTheDocument();
    expect(within(threat).getAllByText('active').length).toBe(2);
  });

  it('computes territory share, army share relative to max, and border contact', () => {
    let state = baseState();
    state = forceOwners(state, {
      Alaska: { owner: 'p-alice', armies: 5 },
      'Northwest Territory': { owner: 'p-bob', armies: 10 },
      Alberta: { owner: 'p-bob', armies: 2 },
      Kamchatka: { owner: 'p-carol', armies: 3 },
    });

    const rows = buildThreatRows(state, 'p-alice');
    expect(rows.length).toBe(2);

    const bob = rows.find((r) => r.player.id === 'p-bob');
    expect(bob).toBeDefined();
    expect(bob?.territories).toBe(2);
    expect(bob?.terrPct).toBeCloseTo((2 / 42) * 100, 3);
    expect(bob?.armies).toBe(12);
    // Max across rivals = 12 (Bob) vs 3 (Carol) → Bob=100%, Carol=25%.
    expect(bob?.armyPct).toBe(100);
    expect(bob?.borderContact).toBe(1);

    const carol = rows.find((r) => r.player.id === 'p-carol');
    expect(carol?.armies).toBe(3);
    expect(carol?.armyPct).toBeCloseTo(25, 3);
    // Alaska ↔ Kamchatka is a valid Risk edge.
    expect(carol?.borderContact).toBe(1);
  });

  it('border contact counts each human territory at most once even with multiple rival adjacencies', () => {
    let state = baseState();
    state = forceOwners(state, {
      Alaska: { owner: 'p-alice', armies: 1 },
      'Northwest Territory': { owner: 'p-bob', armies: 1 },
      Kamchatka: { owner: 'p-bob', armies: 1 },
    });
    const rows = buildThreatRows(state, 'p-alice');
    const bob = rows.find((r) => r.player.id === 'p-bob');
    expect(bob?.borderContact).toBe(1);
  });
});

describe('DiplPanel — conflict history parsing', () => {
  it('parses "<to> captured from <from>." and attributes to current owner', () => {
    let state = baseState();
    state = forceOwners(state, {
      Alaska: { owner: 'p-bob', armies: 2 },
      'Northwest Territory': { owner: 'p-carol', armies: 2 },
    });
    const log: LogLine[] = [
      { turn: 0, text: 'Alaska captured from Kamchatka.' },
      { turn: 0, text: 'Alaska captured from Kamchatka.' },
      { turn: 1, text: 'Northwest Territory captured from Alaska.' },
      { turn: 1, text: 'Kamchatka captured from Alaska.' }, // dropped (no owner)
      { turn: 1, text: 'unrelated log line' }, // ignored
    ];
    const rows = buildCaptureRows(state, log);
    // Bob=2, Carol=1 (Kamchatka dropped — no current owner).
    expect(rows).toEqual([
      { attackerId: 'p-bob', count: 2 },
      { attackerId: 'p-carol', count: 1 },
    ]);
  });

  it('renders conflict rows in the DOM when log has capture events', () => {
    let state = baseState();
    state = forceOwners(state, {
      Alaska: { owner: 'p-bob', armies: 3 },
    });
    seedLog([
      { turn: 0, text: 'Alaska captured from Kamchatka.' },
      { turn: 0, text: 'Alaska captured from Kamchatka.' },
      { turn: 0, text: 'Alaska captured from Kamchatka.' },
    ]);
    render(<DiplPanel state={state} humanPlayerId="p-alice" />);
    const conflict = screen.getByLabelText('dipl-conflict');
    const row = within(conflict).getByTestId('capture-row-p-bob');
    expect(row).toHaveTextContent('Bob');
    expect(row).toHaveTextContent('3 captures');
  });

  it('renders fallback copy when no captures are logged', () => {
    const state = baseState();
    render(<DiplPanel state={state} humanPlayerId="p-alice" />);
    expect(screen.getByText('No captures logged.')).toBeInTheDocument();
  });
});

describe('DiplPanel — continent pressure', () => {
  it('flags continents with dominant non-human ownership and reports remaining territories', () => {
    let state = baseState();
    state = forceOwners(state, {
      Indonesia: { owner: 'p-bob', armies: 1 },
      'New Guinea': { owner: 'p-bob', armies: 1 },
      'Western Australia': { owner: 'p-bob', armies: 1 },
      'Eastern Australia': { owner: 'p-bob', armies: 1 },
      Venezuela: { owner: 'p-alice', armies: 1 },
      Brazil: { owner: 'p-carol', armies: 1 },
    });
    const rows = buildContinentRows(state, 'p-alice');
    const au = rows.find((r) => r.key === 'AU');
    expect(au).toBeDefined();
    expect(au?.dominantOwnerId).toBe('p-bob');
    expect(au?.owned).toBe(4);
    expect(au?.total).toBe(4);
    expect(au?.remaining).toBe(0);
    const sa = rows.find((r) => r.key === 'SA');
    expect(sa?.dominantOwnerId).toBe('p-carol');
    expect(sa?.owned).toBe(1);
    expect(sa?.remaining).toBe(3);
  });

  it('skips continents with no rival holdings', () => {
    const state = baseState();
    const rows = buildContinentRows(state, 'p-alice');
    expect(rows.length).toBe(0);
  });
});
