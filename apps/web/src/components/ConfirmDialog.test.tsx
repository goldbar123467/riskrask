/**
 * ConfirmDialog unit tests.
 *
 * Covers the props contract and keyboard/backdrop accessibility behaviour —
 * the dialog is the shared primitive for all future confirm flows so these
 * tests are the regression gate.
 */

import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from './ConfirmDialog';

describe('ConfirmDialog', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <ConfirmDialog open={false} title="Title" onConfirm={() => {}} onCancel={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders title + body + buttons when open', () => {
    render(
      <ConfirmDialog
        open={true}
        title="Leave this room?"
        body="The lobby will remain open for the other players."
        confirmLabel="Leave"
        cancelLabel="Stay"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
    expect(screen.getByText('Leave this room?')).toBeInTheDocument();
    expect(
      screen.getByText('The lobby will remain open for the other players.'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('confirm-dialog-confirm')).toHaveTextContent('Leave');
    expect(screen.getByTestId('confirm-dialog-cancel')).toHaveTextContent('Stay');
  });

  it('fires onConfirm when confirm button clicked', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<ConfirmDialog open={true} title="Title" onConfirm={onConfirm} onCancel={onCancel} />);
    const user = userEvent.setup();
    await user.click(screen.getByTestId('confirm-dialog-confirm'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('fires onCancel when cancel button clicked', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<ConfirmDialog open={true} title="Title" onConfirm={onConfirm} onCancel={onCancel} />);
    const user = userEvent.setup();
    await user.click(screen.getByTestId('confirm-dialog-cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('fires onCancel when ESC pressed', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<ConfirmDialog open={true} title="Title" onConfirm={onConfirm} onCancel={onCancel} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('fires onCancel when backdrop clicked', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<ConfirmDialog open={true} title="Title" onConfirm={onConfirm} onCancel={onCancel} />);
    const user = userEvent.setup();
    await user.click(screen.getByTestId('confirm-dialog-backdrop'));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('applies danger styling when dangerous=true', () => {
    render(
      <ConfirmDialog
        open={true}
        title="Close this lobby?"
        dangerous={true}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    const confirm = screen.getByTestId('confirm-dialog-confirm');
    expect(confirm.className).toContain('border-danger');
  });
});
