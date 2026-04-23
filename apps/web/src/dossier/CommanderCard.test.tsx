import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CommanderCard } from './CommanderCard';

describe('CommanderCard', () => {
  it('renders name + tag without waitingFor', () => {
    render(<CommanderCard name="Alice" tag="ATTACK · ATTACK" color="#dc2626" />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText(/ATTACK · ATTACK/)).toBeInTheDocument();
    const card = screen.getByLabelText('commander-card');
    expect(card.getAttribute('data-waiting')).toBe('false');
  });

  it('appends waiting-for label when another player is up', () => {
    render(<CommanderCard name="Alice" tag="ATTACK · ATTACK" color="#dc2626" waitingFor="Bob" />);
    const card = screen.getByLabelText('commander-card');
    expect(card.getAttribute('data-waiting')).toBe('true');
    expect(card).toHaveTextContent(/waiting for Bob/);
  });

  it('omits the waiting suffix when waitingFor is null', () => {
    render(<CommanderCard name="Alice" tag="ATTACK · ATTACK" color="#dc2626" waitingFor={null} />);
    const card = screen.getByLabelText('commander-card');
    expect(card.getAttribute('data-waiting')).toBe('false');
    expect(card).not.toHaveTextContent(/waiting for/);
  });
});
