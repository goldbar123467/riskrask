interface TopbarProps {
  session: string;
  turn: string;
  phase: string;
  clock: string;
  players: string;
}

/**
 * Top bar with 5-cell layout: session · turn · phase · clock · players + icon buttons.
 * Pure presentational — no store reads.
 */
export function Topbar({ session, turn, phase, clock, players }: TopbarProps) {
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
      </div>

      {/* Icon buttons */}
      <div className="flex items-center gap-2 px-4">
        <IconBtn title="Mute">
          <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4">
            <title>Mute</title>
            <path d="M6 6H3a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h3l4 4V2L6 6Z" />
            <path d="M15 6c.6.9.9 1.9.9 3s-.3 2.1-.9 3" />
          </svg>
        </IconBtn>
        <IconBtn title="Settings">
          <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4">
            <title>Settings</title>
            <circle cx="9" cy="9" r="2.5" />
            <path d="M9 1v2M9 15v2M1 9h2M15 9h2M3.22 3.22l1.42 1.42M13.36 13.36l1.42 1.42M3.22 14.78l1.42-1.42M13.36 4.64l1.42-1.42" />
          </svg>
        </IconBtn>
        <IconBtn title="Exit">
          <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4">
            <title>Exit</title>
            <path d="M13 13v2a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v2" />
            <path d="M16 9H7M13 6l3 3-3 3" />
          </svg>
        </IconBtn>
      </div>
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

function IconBtn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      className="flex h-[30px] w-[30px] cursor-pointer items-center justify-center border border-line bg-panel text-ink-dim transition-all duration-150 ease-out hover:scale-110 hover:border-hot hover:text-hot active:scale-95"
      style={{ transformOrigin: 'center' }}
    >
      <span className="h-[18px] w-[18px]">{children}</span>
    </button>
  );
}
