import type { GameState } from '@riskrask/engine';
import { createInitialState } from '@riskrask/engine';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type LogLine, useGame } from '../../game/useGame';
import { IntelPanel } from './IntelPanel';

function freshState(): GameState {
  return createInitialState({
    seed: 'intel-panel-test',
    players: [
      { id: '0', name: 'Alice', color: '#f00', isAI: false },
      { id: '1', name: 'Bob', color: '#00f', isAI: true },
    ],
  });
}

function setLog(turn: number, log: LogLine[]): void {
  const state = { ...freshState(), turn };
  useGame.setState({ state, selected: null, hoverTarget: null, effectsQueue: [], log });
}

function renderPanelOnTurn(turn: number): void {
  const state = { ...freshState(), turn };
  render(<IntelPanel state={state} humanPlayerId="0" />);
}

beforeEach(() => {
  useGame.setState({ state: null, selected: null, hoverTarget: null, effectsQueue: [], log: [] });
});

afterEach(() => {
  useGame.setState({ state: null, selected: null, hoverTarget: null, effectsQueue: [], log: [] });
});

describe('IntelPanel', () => {
  it('renders empty state when log is empty', () => {
    setLog(0, []);
    renderPanelOnTurn(0);
    expect(screen.getByLabelText('intel-panel')).toBeInTheDocument();
    expect(screen.getByLabelText('intel-summary')).toHaveTextContent('0 events · turn 1');
  });

  it('shows summary count and current turn', () => {
    setLog(3, [
      { turn: 0, text: 'Alice claims A.', kind: 'log' },
      { turn: 2, text: 'B captured from A.', kind: 'capture' },
      { turn: 3, text: 'Bob eliminated.', kind: 'eliminate' },
    ]);
    renderPanelOnTurn(3);
    expect(screen.getByLabelText('intel-summary')).toHaveTextContent('3 events · turn 4');
  });

  it('groups entries by turn with — TURN N — header', () => {
    setLog(2, [
      { turn: 0, text: 'T0 capture', kind: 'capture' },
      { turn: 1, text: 'T1 capture', kind: 'capture' },
      { turn: 2, text: 'T2 capture', kind: 'capture' },
    ]);
    renderPanelOnTurn(2);
    // Three turn groups
    expect(screen.getByLabelText('turn-1-group')).toBeInTheDocument();
    expect(screen.getByLabelText('turn-2-group')).toBeInTheDocument();
    expect(screen.getByLabelText('turn-3-group')).toBeInTheDocument();
    // Header text uses — Turn N — pattern. Scope to the entries container
    // so the outer summary (which also mentions "turn N") doesn't match.
    const entries = screen.getByLabelText('intel-entries');
    expect(within(entries).getByText(/Turn 1/i)).toBeInTheDocument();
    expect(within(entries).getByText(/Turn 3/i)).toBeInTheDocument();
  });

  it('marks the current turn group as highlighted', () => {
    setLog(5, [
      { turn: 4, text: 'Old', kind: 'capture' },
      { turn: 5, text: 'New', kind: 'capture' },
    ]);
    renderPanelOnTurn(5);
    const current = screen.getByLabelText('turn-6-group');
    const past = screen.getByLabelText('turn-5-group');
    expect(current.getAttribute('data-current-turn')).toBe('true');
    expect(past.getAttribute('data-current-turn')).toBe('false');
  });

  it('renders in reverse-chronological order (newest turn first)', () => {
    setLog(2, [
      { turn: 0, text: 'First', kind: 'capture' },
      { turn: 2, text: 'Last', kind: 'capture' },
    ]);
    renderPanelOnTurn(2);
    const entries = screen.getByLabelText('intel-entries');
    const sections = entries.querySelectorAll('section');
    // The first section rendered should be the newest turn (turn 2 = turn-3-group).
    expect(sections[0]?.getAttribute('aria-label')).toBe('turn-3-group');
  });

  it('filter chips default to all-on', () => {
    setLog(0, []);
    renderPanelOnTurn(0);
    const panel = screen.getByLabelText('intel-panel');
    expect(panel.getAttribute('data-active-filters')).toBe('all');
    expect(screen.getByLabelText('filter-all')).toHaveAttribute('aria-pressed', 'true');
  });

  it('clicking a non-all chip narrows to that category', () => {
    setLog(1, [
      { turn: 1, text: 'Dice a vs d', kind: 'dice' },
      { turn: 1, text: 'X captured from Y.', kind: 'capture' },
      { turn: 1, text: 'Bob eliminated.', kind: 'eliminate' },
    ]);
    renderPanelOnTurn(1);
    fireEvent.click(screen.getByLabelText('filter-capture'));
    // all chip now off
    expect(screen.getByLabelText('filter-all')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByLabelText('filter-capture')).toHaveAttribute('aria-pressed', 'true');

    const entries = screen.getByLabelText('intel-entries');
    expect(entries.getAttribute('data-visible-count')).toBe('1');
    const items = within(entries).getAllByRole('listitem');
    expect(items).toHaveLength(1);
    expect(items[0]?.getAttribute('data-kind')).toBe('capture');
  });

  it('supports multi-select (additive) between non-all chips', () => {
    setLog(1, [
      { turn: 1, text: 'D1', kind: 'dice' },
      { turn: 1, text: 'C1', kind: 'capture' },
      { turn: 1, text: 'E1', kind: 'eliminate' },
      { turn: 1, text: 'L1', kind: 'log' },
    ]);
    renderPanelOnTurn(1);
    fireEvent.click(screen.getByLabelText('filter-capture'));
    fireEvent.click(screen.getByLabelText('filter-dice'));
    const entries = screen.getByLabelText('intel-entries');
    expect(entries.getAttribute('data-visible-count')).toBe('2');
    const kinds = within(entries)
      .getAllByRole('listitem')
      .map((li) => li.getAttribute('data-kind'))
      .sort();
    expect(kinds).toEqual(['capture', 'dice']);
  });

  it('clicking the same chip twice deselects and falls back to all', () => {
    setLog(1, [{ turn: 1, text: 'C', kind: 'capture' }]);
    renderPanelOnTurn(1);
    const captures = screen.getByLabelText('filter-capture');
    fireEvent.click(captures);
    fireEvent.click(captures);
    expect(screen.getByLabelText('filter-all')).toHaveAttribute('aria-pressed', 'true');
  });

  it('clicking all resets filters', () => {
    setLog(1, [
      { turn: 1, text: 'C', kind: 'capture' },
      { turn: 1, text: 'D', kind: 'dice' },
    ]);
    renderPanelOnTurn(1);
    fireEvent.click(screen.getByLabelText('filter-capture'));
    fireEvent.click(screen.getByLabelText('filter-all'));
    expect(screen.getByLabelText('filter-all')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('filter-capture')).toHaveAttribute('aria-pressed', 'false');
    const entries = screen.getByLabelText('intel-entries');
    expect(entries.getAttribute('data-visible-count')).toBe('2');
  });

  it('treats entries without an explicit kind as the log category', () => {
    setLog(1, [
      { turn: 1, text: 'legacy entry' }, // no kind
      { turn: 1, text: 'capture entry', kind: 'capture' },
    ]);
    renderPanelOnTurn(1);
    fireEvent.click(screen.getByLabelText('filter-log'));
    const entries = screen.getByLabelText('intel-entries');
    const items = within(entries).getAllByRole('listitem');
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveTextContent('legacy entry');
    expect(items[0]?.getAttribute('data-kind')).toBe('log');
  });

  it('caps rendered entries at 80 (MAX_VISIBLE)', () => {
    const log: LogLine[] = [];
    for (let i = 0; i < 120; i++) {
      log.push({ turn: i, text: `e${i}`, kind: 'capture' });
    }
    setLog(200, log);
    renderPanelOnTurn(200);
    const entries = screen.getByLabelText('intel-entries');
    expect(Number(entries.getAttribute('data-visible-count'))).toBe(80);
  });

  it('renders a no-match message when filter excludes everything', () => {
    setLog(1, [{ turn: 1, text: 'C', kind: 'capture' }]);
    renderPanelOnTurn(1);
    // Turn on 'dice' only; no dice entries exist.
    fireEvent.click(screen.getByLabelText('filter-dice'));
    expect(screen.getByText(/No events match this filter/)).toBeInTheDocument();
  });
});
