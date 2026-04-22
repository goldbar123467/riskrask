/**
 * ConfirmDialog — minimal controlled overlay for a binary decision.
 *
 * Use-cases: leave-room / close-lobby flows, destructive actions, anything
 * where the user should confirm before we fire a POST. Styled to match the
 * existing panel + border + font-mono aesthetic; no portal needed.
 *
 * Controlled: parent owns `open` and cancel/confirm callbacks. Component
 * does NOT remember state between opens — rely on parent to clear it.
 *
 * Accessibility:
 *   - ESC → onCancel
 *   - Backdrop click → onCancel
 *   - Focus moves to Confirm on open; Tab / Shift+Tab cycle between Cancel
 *     and Confirm (tiny manual focus trap, no external lib).
 *   - Fades in when `open` flips true; renders null otherwise.
 */

import { type ReactNode, useEffect, useRef } from 'react';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Switches the confirm button to the danger (red) style. */
  dangerous?: boolean;
  onConfirm(): void;
  onCancel(): void;
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  dangerous = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);

  // ESC closes. Also move focus to confirm on open.
  useEffect(() => {
    if (!open) return;
    const prevActive = typeof document !== 'undefined' ? document.activeElement : null;
    confirmRef.current?.focus();

    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', onKey);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('keydown', onKey);
      }
      // Restore focus to whatever held it before opening.
      if (prevActive instanceof HTMLElement) {
        prevActive.focus?.();
      }
    };
  }, [open, onCancel]);

  if (!open) return null;

  // Manual 2-element focus trap — Tab cycles Cancel ↔ Confirm.
  function handleKeyInTrap(e: React.KeyboardEvent<HTMLDivElement>): void {
    if (e.key !== 'Tab') return;
    const active = document.activeElement;
    if (e.shiftKey) {
      if (active === cancelRef.current) {
        e.preventDefault();
        confirmRef.current?.focus();
      }
    } else {
      if (active === confirmRef.current) {
        e.preventDefault();
        cancelRef.current?.focus();
      }
    }
  }

  const confirmBtnClass = dangerous
    ? 'flex-1 border border-danger bg-danger/10 py-2 font-mono text-[10px] uppercase tracking-widest text-danger hover:bg-danger/20 focus:outline-none focus:ring-1 focus:ring-danger'
    : 'flex-1 border border-hot bg-hot/10 py-2 font-mono text-[10px] uppercase tracking-widest text-hot hover:bg-hot/20 focus:outline-none focus:ring-1 focus:ring-hot';

  return (
    <div
      data-testid="confirm-dialog"
      onKeyDown={handleKeyInTrap}
      className="fixed inset-0 z-[70] flex items-center justify-center"
    >
      <button
        type="button"
        tabIndex={-1}
        aria-label="dismiss"
        data-testid="confirm-dialog-backdrop"
        onClick={onCancel}
        className="absolute inset-0 block h-full w-full cursor-default bg-black/70"
      />
      <dialog
        open
        aria-label={title}
        aria-modal="true"
        className="relative flex w-[380px] max-w-[calc(100vw-2rem)] flex-col gap-5 border border-line bg-bg-0 p-6 text-ink"
      >
        <div className="flex flex-col gap-1">
          <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink-faint">Confirm</p>
          <h2 className="font-display text-lg text-ink">{title}</h2>
        </div>

        {body !== undefined && body !== null && (
          <div className="font-mono text-[11px] leading-relaxed text-ink-dim">{body}</div>
        )}

        <div className="flex gap-3">
          <button
            ref={cancelRef}
            type="button"
            data-testid="confirm-dialog-cancel"
            onClick={onCancel}
            className="flex-1 border border-line py-2 font-mono text-[10px] uppercase tracking-widest text-ink-dim hover:border-line-2 hover:text-ink focus:outline-none focus:ring-1 focus:ring-line-2"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            data-testid="confirm-dialog-confirm"
            onClick={onConfirm}
            className={confirmBtnClass}
          >
            {confirmLabel}
          </button>
        </div>
      </dialog>
    </div>
  );
}
