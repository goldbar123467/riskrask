import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Topbar } from './Topbar';

describe('Topbar', () => {
  it('renders all meta fields', () => {
    render(<Topbar session="SES-001" turn="12" phase="ATTACK" clock="01:30" players="3/6" />);

    expect(screen.getByText('SES-001')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('ATTACK')).toBeInTheDocument();
    expect(screen.getByText('01:30')).toBeInTheDocument();
    expect(screen.getByText('3/6')).toBeInTheDocument();
  });

  it('shows YOU when isYourTurn is true', () => {
    render(
      <Topbar
        session="SES-001"
        turn="12"
        phase="ATTACK"
        clock="01:30"
        players="3/6"
        currentPlayerName="Alice"
        isYourTurn
      />,
    );
    const pill = screen.getByLabelText('whose-turn');
    expect(pill.getAttribute('data-your-turn')).toBe('true');
    expect(pill).toHaveTextContent('YOU');
  });

  it('shows the current player name + WAITING when not your turn', () => {
    render(
      <Topbar
        session="SES-001"
        turn="12"
        phase="ATTACK"
        clock="01:30"
        players="3/6"
        currentPlayerName="Bob"
        isYourTurn={false}
      />,
    );
    const pill = screen.getByLabelText('whose-turn');
    expect(pill.getAttribute('data-your-turn')).toBe('false');
    expect(pill).toHaveTextContent('Bob');
    expect(pill).toHaveTextContent('WAITING');
  });

  it('omits the whose-turn pill when currentPlayerName is undefined', () => {
    render(<Topbar session="SES-001" turn="12" phase="ATTACK" clock="01:30" players="3/6" />);
    expect(screen.queryByLabelText('whose-turn')).toBeNull();
  });
});
