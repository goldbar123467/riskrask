import { useEffect, useState } from 'react';
import { ConfirmDialog } from '../components/ConfirmDialog';

/**
 * localStorage keys for user-level UI prefs. Boolean-as-string '1'/'0'.
 * Kept module-local; any future consumer (sound manager, motion hooks)
 * should read the same keys rather than duplicating the convention.
 */
const LS_MUTE = 'rr.mute';
const LS_REDUCED_MOTION = 'rr.reducedMotion';

function readBoolFlag(key: string): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeBoolFlag(key: string, value: boolean): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key, value ? '1' : '0');
  } catch {
    // Ignore — private-mode or quota errors don't matter for a UI pref.
  }
}

interface TopbarProps {
  session: string;
  turn: string;
  phase: string;
  clock: string;
  players: string;
  /** Name of the current player (whose turn it is). Optional — solo routes may omit it. */
  currentPlayerName?: string;
  /** True when it's the local human's turn. Drives the YOU / WAITING pill. */
  isYourTurn?: boolean;
  /**
   * Called after the user confirms the Exit dialog. Route owners decide
   * where to navigate (home for solo, lobby for MP). If omitted, Exit is
   * still clickable but confirming is a no-op.
   */
  onExit?: () => void;
}

/**
 * Top bar with meta cells + a "whose turn" pill + icon buttons.
 * Presentational for the meta cells; owns small local UI state for the
 * settings modal, exit-confirm dialog, and the mute flag (persisted to
 * localStorage for forward-compat with a future audio system).
 */
export function Topbar({
  session,
  turn,
  phase,
  clock,
  players,
  currentPlayerName,
  isYourTurn,
  onExit,
}: TopbarProps) {
  // Hydrate from localStorage on mount. Defaults (false) are safe SSR/test
  // values; the effect syncs the real prefs once the client is live.
  const [muted, setMuted] = useState<boolean>(false);
  const [reducedMotion, setReducedMotion] = useState<boolean>(false);
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);
  const [exitOpen, setExitOpen] = useState<boolean>(false);

  useEffect(() => {
    setMuted(readBoolFlag(LS_MUTE));
    setReducedMotion(readBoolFlag(LS_REDUCED_MOTION));
  }, []);

  function toggleMute(): void {
    setMuted((prev) => {
      const next = !prev;
      writeBoolFlag(LS_MUTE, next);
      return next;
    });
  }

  function toggleReducedMotion(): void {
    setReducedMotion((prev) => {
      const next = !prev;
      writeBoolFlag(LS_REDUCED_MOTION, next);
      return next;
    });
  }

  function handleExitConfirm(): void {
    setExitOpen(false);
    onExit?.();
  }

  return (
    <div className="flex h-full items-stretch">
      {/* Title area */}
      <div className="flex items-center gap-4 border-r border-line px-6">
        <h1 className="font-display text-[13px] font-medium tracking-[0.36em] text-ink">RISK</h1>
        <span className="font-mono text-[10px] tracking-[0.12em] text-ink-faint">v3 · CONSOLE</span>
      </div>

      {/* Meta cells */}
      <div className="flex flex-1 items-stretch">
        <TopbarCell label="SESSION" value={session} />
        <TopbarCell label="TURN" value={turn} hot />
        <TopbarCell label="PHASE" value={phase} />
        <TopbarCell label="CLOCK" value={clock} />
        <TopbarCell label="PLAYERS" value={players} />
        {currentPlayerName !== undefined && (
          <WhoseTurnPill name={currentPlayerName} isYourTurn={isYourTurn ?? false} />
        )}
      </div>

      {/* Icon buttons */}
      <div className="flex items-center gap-2 px-4">
        <IconBtn
          title={muted ? 'Unmute' : 'Mute'}
          onClick={toggleMute}
          ariaPressed={muted}
          dimmed={muted}
          testId="topbar-mute"
        >
          <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4">
            <title>{muted ? 'Unmute' : 'Mute'}</title>
            <path d="M6 6H3a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h3l4 4V2L6 6Z" />
            {muted ? (
              // Strike-through + X over the speaker wave when muted.
              <path d="M13 6l4 6M17 6l-4 6" />
            ) : (
              <path d="M15 6c.6.9.9 1.9.9 3s-.3 2.1-.9 3" />
            )}
          </svg>
        </IconBtn>
        <IconBtn title="Settings" onClick={() => setSettingsOpen(true)} testId="topbar-settings">
          <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4">
            <title>Settings</title>
            <circle cx="9" cy="9" r="2.5" />
            <path d="M9 1v2M9 15v2M1 9h2M15 9h2M3.22 3.22l1.42 1.42M13.36 13.36l1.42 1.42M3.22 14.78l1.42-1.42M13.36 4.64l1.42-1.42" />
          </svg>
        </IconBtn>
        <IconBtn title="Exit" onClick={() => setExitOpen(true)} testId="topbar-exit">
          <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4">
            <title>Exit</title>
            <path d="M13 13v2a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v2" />
            <path d="M16 9H7M13 6l3 3-3 3" />
          </svg>
        </IconBtn>
      </div>

      {settingsOpen && (
        <SettingsModal
          muted={muted}
          reducedMotion={reducedMotion}
          onToggleMute={toggleMute}
          onToggleReducedMotion={toggleReducedMotion}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      <ConfirmDialog
        open={exitOpen}
        title="Leave this game?"
        body="Your in-progress game will be abandoned."
        confirmLabel="Leave"
        cancelLabel="Stay"
        dangerous
        onConfirm={handleExitConfirm}
        onCancel={() => setExitOpen(false)}
      />
    </div>
  );
}

function TopbarCell({ label, value, hot }: { label: string; value: string; hot?: boolean }) {
  return (
    <div className="flex min-w-[110px] flex-col justify-center gap-0.5 border-r border-line px-5">
      <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink-faint">
        {label}
      </span>
      <span
        className={`font-display text-[13px] tracking-[0.04em] ${hot ? 'text-hot' : 'text-ink'}`}
      >
        {value}
      </span>
    </div>
  );
}

/**
 * Whose-turn pill. Shows `YOU` in the accent color when it's the local
 * human's turn, or `{name} · WAITING` in a muted tone when another player
 * (remote human or AI) is up. Keeps the Topbar density identical to the
 * meta cells so layout doesn't shift between turns.
 */
function WhoseTurnPill({ name, isYourTurn }: { name: string; isYourTurn: boolean }) {
  return (
    <div
      className="flex min-w-[140px] flex-col justify-center gap-0.5 border-r border-line px-5"
      aria-label="whose-turn"
      data-your-turn={isYourTurn ? 'true' : 'false'}
    >
      <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink-faint">TURN</span>
      {isYourTurn ? (
        <span className="font-display text-[13px] tracking-[0.04em] text-hot">YOU</span>
      ) : (
        <span className="flex items-baseline gap-2">
          <span className="truncate font-display text-[13px] tracking-[0.04em] text-ink-dim">
            {name}
          </span>
          <span className="font-mono text-[8px] uppercase tracking-[0.18em] text-ink-faint">
            WAITING
          </span>
        </span>
      )}
    </div>
  );
}

interface IconBtnProps {
  title: string;
  children: React.ReactNode;
  onClick?: () => void;
  /** When boolean, renders aria-pressed for toggle semantics. */
  ariaPressed?: boolean;
  /** Dim the icon — used to indicate a "muted/off" visual state. */
  dimmed?: boolean;
  testId?: string;
}

function IconBtn({ title, children, onClick, ariaPressed, dimmed, testId }: IconBtnProps) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      aria-pressed={ariaPressed}
      data-testid={testId}
      className="flex h-[30px] w-[30px] cursor-pointer items-center justify-center border border-line bg-panel text-ink-dim transition-all duration-150 ease-out hover:scale-110 hover:border-hot hover:text-hot active:scale-95"
      style={{ transformOrigin: 'center', opacity: dimmed ? 0.4 : 1 }}
    >
      <span className="h-[18px] w-[18px]">{children}</span>
    </button>
  );
}

interface SettingsModalProps {
  muted: boolean;
  reducedMotion: boolean;
  onToggleMute(): void;
  onToggleReducedMotion(): void;
  onClose(): void;
}

/**
 * Local settings modal. Minimal, no portal, ESC/backdrop close. Toggles
 * write through to the caller which already persists to localStorage.
 */
function SettingsModal({
  muted,
  reducedMotion,
  onToggleMute,
  onToggleReducedMotion,
  onClose,
}: SettingsModalProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      data-testid="settings-modal"
      className="fixed inset-0 z-[70] flex items-center justify-center"
    >
      <button
        type="button"
        tabIndex={-1}
        aria-label="dismiss-settings"
        data-testid="settings-modal-backdrop"
        onClick={onClose}
        className="absolute inset-0 block h-full w-full cursor-default bg-black/70"
      />
      <dialog
        open
        aria-label="Settings"
        aria-modal="true"
        className="relative flex w-[380px] max-w-[calc(100vw-2rem)] flex-col gap-5 border border-line bg-bg-0 p-6 text-ink"
      >
        <div className="flex flex-col gap-1">
          <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink-faint">
            Settings
          </p>
          <h2 className="font-display text-lg text-ink">Preferences</h2>
        </div>

        <div className="flex flex-col gap-3">
          <SettingsToggle
            label="Mute audio"
            checked={muted}
            onChange={onToggleMute}
            testId="settings-mute-toggle"
          />
          <SettingsToggle
            label="Reduced motion"
            checked={reducedMotion}
            onChange={onToggleReducedMotion}
            testId="settings-reduced-motion-toggle"
          />
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            data-testid="settings-modal-close"
            onClick={onClose}
            className="flex-1 border border-line py-2 font-mono text-[10px] uppercase tracking-widest text-ink-dim hover:border-line-2 hover:text-ink focus:outline-none focus:ring-1 focus:ring-line-2"
          >
            Close
          </button>
        </div>
      </dialog>
    </div>
  );
}

function SettingsToggle({
  label,
  checked,
  onChange,
  testId,
}: {
  label: string;
  checked: boolean;
  onChange(): void;
  testId: string;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 border border-line bg-panel px-3 py-2">
      <span className="font-mono text-[11px] uppercase tracking-widest text-ink-dim">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        data-testid={testId}
        className="h-4 w-4 cursor-pointer accent-hot"
      />
    </label>
  );
}
