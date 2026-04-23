import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Topbar } from './Topbar';

describe('Topbar', () => {
  beforeEach(() => {
    // Reset persisted prefs between tests so toggle state doesn't leak.
    localStorage.clear();
  });

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

  it('mute button toggles localStorage and aria-pressed', async () => {
    render(<Topbar session="SES-001" turn="12" phase="ATTACK" clock="01:30" players="3/6" />);
    const user = userEvent.setup();

    const muteBtn = screen.getByTestId('topbar-mute');
    // Default hydrated state: not muted.
    expect(muteBtn.getAttribute('aria-pressed')).toBe('false');
    expect(localStorage.getItem('rr.mute')).toBeNull();

    await user.click(muteBtn);
    expect(muteBtn.getAttribute('aria-pressed')).toBe('true');
    expect(localStorage.getItem('rr.mute')).toBe('1');

    await user.click(muteBtn);
    expect(muteBtn.getAttribute('aria-pressed')).toBe('false');
    expect(localStorage.getItem('rr.mute')).toBe('0');
  });

  it('mute button hydrates aria-pressed from localStorage', () => {
    localStorage.setItem('rr.mute', '1');
    render(<Topbar session="SES-001" turn="12" phase="ATTACK" clock="01:30" players="3/6" />);
    const muteBtn = screen.getByTestId('topbar-mute');
    expect(muteBtn.getAttribute('aria-pressed')).toBe('true');
  });

  it('settings button opens a modal with the two toggles', async () => {
    render(<Topbar session="SES-001" turn="12" phase="ATTACK" clock="01:30" players="3/6" />);
    const user = userEvent.setup();

    expect(screen.queryByTestId('settings-modal')).toBeNull();

    await user.click(screen.getByTestId('topbar-settings'));

    expect(screen.getByTestId('settings-modal')).toBeInTheDocument();
    expect(screen.getByTestId('settings-mute-toggle')).toBeInTheDocument();
    expect(screen.getByTestId('settings-reduced-motion-toggle')).toBeInTheDocument();
  });

  it('settings modal reduced-motion toggle writes localStorage', async () => {
    render(<Topbar session="SES-001" turn="12" phase="ATTACK" clock="01:30" players="3/6" />);
    const user = userEvent.setup();
    await user.click(screen.getByTestId('topbar-settings'));

    const rmToggle = screen.getByTestId('settings-reduced-motion-toggle') as HTMLInputElement;
    expect(rmToggle.checked).toBe(false);
    expect(localStorage.getItem('rr.reducedMotion')).toBeNull();

    await user.click(rmToggle);
    expect(rmToggle.checked).toBe(true);
    expect(localStorage.getItem('rr.reducedMotion')).toBe('1');
  });

  it('settings modal close button dismisses the modal', async () => {
    render(<Topbar session="SES-001" turn="12" phase="ATTACK" clock="01:30" players="3/6" />);
    const user = userEvent.setup();
    await user.click(screen.getByTestId('topbar-settings'));
    expect(screen.getByTestId('settings-modal')).toBeInTheDocument();

    await user.click(screen.getByTestId('settings-modal-close'));
    expect(screen.queryByTestId('settings-modal')).toBeNull();
  });

  it('exit button opens the ConfirmDialog (does not call onExit until confirmed)', async () => {
    const onExit = vi.fn();
    render(
      <Topbar
        session="SES-001"
        turn="12"
        phase="ATTACK"
        clock="01:30"
        players="3/6"
        onExit={onExit}
      />,
    );
    const user = userEvent.setup();

    expect(screen.queryByTestId('confirm-dialog')).toBeNull();

    await user.click(screen.getByTestId('topbar-exit'));
    expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
    expect(onExit).not.toHaveBeenCalled();
  });

  it('exit ConfirmDialog confirm triggers onExit and closes', async () => {
    const onExit = vi.fn();
    render(
      <Topbar
        session="SES-001"
        turn="12"
        phase="ATTACK"
        clock="01:30"
        players="3/6"
        onExit={onExit}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId('topbar-exit'));
    await user.click(screen.getByTestId('confirm-dialog-confirm'));

    expect(onExit).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('confirm-dialog')).toBeNull();
  });

  it('exit ConfirmDialog cancel leaves onExit uncalled', async () => {
    const onExit = vi.fn();
    render(
      <Topbar
        session="SES-001"
        turn="12"
        phase="ATTACK"
        clock="01:30"
        players="3/6"
        onExit={onExit}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId('topbar-exit'));
    await user.click(screen.getByTestId('confirm-dialog-cancel'));

    expect(onExit).not.toHaveBeenCalled();
    expect(screen.queryByTestId('confirm-dialog')).toBeNull();
  });
});
