import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type LogLine, useGame } from '../../game/useGame';
import { LogPanel } from './LogPanel';

// Helper: seed the zustand store with a fabricated log. We avoid dispatching
// real engine actions here — the panel only cares about the `log` slice.
function seedLog(lines: LogLine[]) {
  act(() => {
    useGame.setState({ log: lines });
  });
}

beforeEach(() => {
  // Reset relevant store slices before each test. Other slices are left
  // untouched; LogPanel only subscribes to `log`.
  act(() => {
    useGame.setState({ log: [] });
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('LogPanel', () => {
  it('renders header with event + turn totals', () => {
    seedLog([
      { turn: 0, text: 'USA deploys 3 in Alaska.' },
      { turn: 0, text: 'USA attacks Kamchatka.' },
      { turn: 1, text: 'RUS captures Alaska.' },
      { turn: 2, text: 'CHN trades cards.' },
    ]);
    render(<LogPanel humanPlayerId="p1" />);
    const panel = screen.getByLabelText('log-panel');
    expect(panel.getAttribute('data-total-events')).toBe('4');
    expect(panel.getAttribute('data-turns-played')).toBe('3');
    expect(panel).toHaveTextContent(/4 events/);
    expect(panel).toHaveTextContent(/3 turns/);
  });

  it('renders empty state when log is empty', () => {
    render(<LogPanel humanPlayerId="p1" />);
    expect(screen.getByText('No events yet.')).toBeInTheDocument();
  });

  it('filters entries by case-insensitive substring', async () => {
    const user = userEvent.setup();
    seedLog([
      { turn: 0, text: 'USA deploys 3 in Alaska.' },
      { turn: 0, text: 'USA attacks Kamchatka.' },
      { turn: 1, text: 'RUS captures Alaska.' },
      { turn: 2, text: 'CHN trades cards.' },
    ]);
    render(<LogPanel humanPlayerId="p1" />);

    const input = screen.getByLabelText('filter log');
    await user.type(input, 'alaska');

    // Two matches: deploy + capture. The attack/cards lines must vanish.
    expect(screen.getByText('USA deploys 3 in Alaska.')).toBeInTheDocument();
    expect(screen.getByText('RUS captures Alaska.')).toBeInTheDocument();
    expect(screen.queryByText('USA attacks Kamchatka.')).not.toBeInTheDocument();
    expect(screen.queryByText('CHN trades cards.')).not.toBeInTheDocument();
  });

  it('shows "no matching events" when filter has no hits', async () => {
    const user = userEvent.setup();
    seedLog([{ turn: 0, text: 'USA deploys 3 in Alaska.' }]);
    render(<LogPanel humanPlayerId="p1" />);
    await user.type(screen.getByLabelText('filter log'), 'zzzz');
    expect(screen.getByText('No matching events.')).toBeInTheDocument();
  });

  it('expands the 3 most-recent turns by default and collapses older ones', () => {
    // Seed 5 turns so turns 2,3,4 are the default-expanded group and turns
    // 0,1 start collapsed.
    seedLog([
      { turn: 0, text: 't0-a' },
      { turn: 1, text: 't1-a' },
      { turn: 2, text: 't2-a' },
      { turn: 3, text: 't3-a' },
      { turn: 4, text: 't4-a' },
    ]);
    render(<LogPanel humanPlayerId="p1" />);

    // Expanded turns have their body text visible.
    expect(screen.getByText('t4-a')).toBeInTheDocument();
    expect(screen.getByText('t3-a')).toBeInTheDocument();
    expect(screen.getByText('t2-a')).toBeInTheDocument();
    // Collapsed turns: body hidden.
    expect(screen.queryByText('t1-a')).not.toBeInTheDocument();
    expect(screen.queryByText('t0-a')).not.toBeInTheDocument();

    // aria-expanded state matches.
    const turn4Header = screen.getByRole('button', { name: /turn 5/i });
    const turn0Header = screen.getByRole('button', { name: /turn 1/i });
    expect(turn4Header.getAttribute('aria-expanded')).toBe('true');
    expect(turn0Header.getAttribute('aria-expanded')).toBe('false');
  });

  it('toggles a turn section open and closed on header click', async () => {
    const user = userEvent.setup();
    seedLog([
      { turn: 0, text: 't0-a' },
      { turn: 1, text: 't1-a' },
      { turn: 2, text: 't2-a' },
      { turn: 3, text: 't3-a' },
    ]);
    render(<LogPanel humanPlayerId="p1" />);

    // Turn 0 starts collapsed (only turns 1,2,3 are in the default-expanded
    // top 3).
    expect(screen.queryByText('t0-a')).not.toBeInTheDocument();
    const turn0Header = screen.getByRole('button', { name: /turn 1/i });
    expect(turn0Header.getAttribute('aria-expanded')).toBe('false');

    // Expand.
    await user.click(turn0Header);
    expect(screen.getByText('t0-a')).toBeInTheDocument();
    expect(turn0Header.getAttribute('aria-expanded')).toBe('true');

    // Collapse again.
    await user.click(turn0Header);
    expect(screen.queryByText('t0-a')).not.toBeInTheDocument();
    expect(turn0Header.getAttribute('aria-expanded')).toBe('false');

    // And a default-expanded turn can be collapsed too.
    const turn3Header = screen.getByRole('button', { name: /turn 4/i });
    expect(turn3Header.getAttribute('aria-expanded')).toBe('true');
    await user.click(turn3Header);
    expect(turn3Header.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('t3-a')).not.toBeInTheDocument();
  });

  it('copies visible log to clipboard and shows the "copied" toast', async () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    // jsdom doesn't provide navigator.clipboard; stub it.
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    seedLog([
      { turn: 0, text: 'USA deploys 3 in Alaska.' },
      { turn: 1, text: 'RUS captures Alaska.' },
    ]);
    render(<LogPanel humanPlayerId="p1" />);

    const copyBtn = screen.getByRole('button', { name: /copy log to clipboard/i });
    expect(copyBtn).toHaveTextContent(/copy/i);
    expect(copyBtn).not.toHaveTextContent(/copied/i);

    // Click — userEvent uses real timers internally, so drive synchronously.
    fireEvent.click(copyBtn);

    expect(writeText).toHaveBeenCalledTimes(1);
    const payload = writeText.mock.calls[0]?.[0] as string;
    expect(payload).toContain('Turn 1');
    expect(payload).toContain('Turn 2');
    expect(payload).toContain('USA deploys 3 in Alaska.');
    expect(payload).toContain('RUS captures Alaska.');

    // Flush the resolved promise so the state update runs.
    await act(async () => {
      await Promise.resolve();
    });
    expect(copyBtn).toHaveTextContent(/copied/i);

    // Toast fades after the timeout.
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(copyBtn).toHaveTextContent(/^copy$/i);
  });

  it('excludes filtered-out turns from the copy payload', async () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    seedLog([
      { turn: 0, text: 'USA deploys 3 in Alaska.' },
      { turn: 1, text: 'CHN trades cards.' },
    ]);
    render(<LogPanel humanPlayerId="p1" />);

    // Apply a filter that only matches the turn-0 line.
    const input = screen.getByLabelText('filter log');
    act(() => {
      fireEvent.change(input, { target: { value: 'alaska' } });
    });

    const copyBtn = screen.getByRole('button', { name: /copy log to clipboard/i });
    act(() => {
      fireEvent.click(copyBtn);
    });

    const payload = writeText.mock.calls[0]?.[0] as string;
    expect(payload).toContain('USA deploys 3 in Alaska.');
    expect(payload).not.toContain('CHN trades cards.');

    // Sanity: the filtered-out turn section is also absent from the DOM list.
    expect(within(screen.getByTestId('log-scroll')).queryByText(/CHN/)).toBeNull();

    // Flush the clipboard resolution before the test exits so the setCopied
    // update doesn't trip an "update not wrapped in act" warning.
    await act(async () => {
      await Promise.resolve();
    });
  });
});
