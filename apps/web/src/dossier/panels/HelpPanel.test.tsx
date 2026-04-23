import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { HelpPanel } from './HelpPanel';

describe('HelpPanel', () => {
  it('renders all four collapsible sections', () => {
    render(<HelpPanel />);
    expect(screen.getByText('Phase quick-ref')).toBeInTheDocument();
    expect(screen.getByText('Dice math')).toBeInTheDocument();
    expect(screen.getByText('Card trades')).toBeInTheDocument();
    expect(screen.getByText('Keyboard shortcuts')).toBeInTheDocument();
  });

  it('opens the phase quick-ref by default and keeps others collapsed', () => {
    const { container } = render(<HelpPanel />);
    const phases = container.querySelector(
      "[data-testid='help-section-phases']",
    ) as HTMLDetailsElement;
    const dice = container.querySelector("[data-testid='help-section-dice']") as HTMLDetailsElement;
    const cards = container.querySelector(
      "[data-testid='help-section-cards']",
    ) as HTMLDetailsElement;
    const keys = container.querySelector("[data-testid='help-section-keys']") as HTMLDetailsElement;
    expect(phases.open).toBe(true);
    expect(dice.open).toBe(false);
    expect(cards.open).toBe(false);
    expect(keys.open).toBe(false);
  });

  it('renders the full phase table (3 data rows)', () => {
    const { container } = render(<HelpPanel />);
    const table = container.querySelector("[data-testid='help-section-phases'] table");
    expect(table).not.toBeNull();
    const rows = table!.querySelectorAll('tbody tr');
    expect(rows.length).toBe(3);
    expect(screen.getByText('Reinforce')).toBeInTheDocument();
    expect(screen.getByText('Attack')).toBeInTheDocument();
    expect(screen.getByText('Fortify')).toBeInTheDocument();
  });

  it('toggles a collapsed section open on summary click', async () => {
    const { container } = render(<HelpPanel />);
    const dice = container.querySelector("[data-testid='help-section-dice']") as HTMLDetailsElement;
    expect(dice.open).toBe(false);
    await userEvent.click(screen.getByText('Dice math'));
    expect(dice.open).toBe(true);
  });

  it('documents the Space, Esc, and ? shortcuts', () => {
    const { container } = render(<HelpPanel />);
    const keys = container.querySelector("[data-testid='help-section-keys']") as HTMLDetailsElement;
    keys.open = true;
    const kbds = keys.querySelectorAll('kbd');
    const labels = Array.from(kbds).map((k) => k.textContent);
    expect(labels).toContain('Space');
    expect(labels).toContain('Esc');
    expect(labels).toContain('?');
  });

  it('renders the dice example grid with attacker and defender headers', () => {
    const { container } = render(<HelpPanel />);
    const grid = container.querySelector("[aria-label='dice-example']");
    expect(grid).not.toBeNull();
    expect(grid!.textContent).toContain('Attacker');
    expect(grid!.textContent).toContain('Defender');
  });

  it('renders the version footer with a fallback when no env is set', () => {
    const { container } = render(<HelpPanel />);
    const footer = container.querySelector("[data-testid='help-version']");
    expect(footer).not.toBeNull();
    expect(footer!.textContent).toMatch(/^v/);
  });
});
