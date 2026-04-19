type RailItem = 'map' | 'army' | 'intel' | 'dipl' | 'log' | 'help';

interface RailProps {
  activeItem: RailItem;
  onSelect: (item: RailItem) => void;
}

const ITEMS: { id: RailItem; label: string; icon: React.ReactNode }[] = [
  {
    id: 'map',
    label: 'MAP',
    icon: (
      <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4">
        <polygon points="2,14 7,4 11,11 14,7 16,14" />
      </svg>
    ),
  },
  {
    id: 'army',
    label: 'ARMY',
    icon: (
      <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4">
        <rect x="5" y="9" width="8" height="5" rx="1" />
        <path d="M7 9V6a2 2 0 1 1 4 0v3" />
      </svg>
    ),
  },
  {
    id: 'intel',
    label: 'INTEL',
    icon: (
      <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4">
        <circle cx="9" cy="9" r="6" />
        <path d="M9 5v4l3 2" />
      </svg>
    ),
  },
  {
    id: 'dipl',
    label: 'DIPL',
    icon: (
      <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4">
        <path d="M3 9h12M9 3l6 6-6 6" />
      </svg>
    ),
  },
  {
    id: 'log',
    label: 'LOG',
    icon: (
      <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4">
        <path d="M3 4h12M3 8h8M3 12h10M3 16h6" />
      </svg>
    ),
  },
  {
    id: 'help',
    label: 'HELP',
    icon: (
      <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4">
        <circle cx="9" cy="9" r="7" />
        <path d="M6.8 7c0-1.2 1-2.1 2.2-2.1 1.3 0 2.2 1 2.2 2.1 0 1-.6 1.6-1.5 2l-.7.3V11" />
        <circle cx="9" cy="13" r=".6" fill="currentColor" />
      </svg>
    ),
  },
];

/**
 * Vertical navigation rail (72px wide). Hot-accent bar on the left edge of active item.
 * Pure presentational — no store reads.
 */
export function Rail({ activeItem, onSelect }: RailProps) {
  return (
    <div className="flex flex-col items-center gap-1.5 pt-3.5">
      {ITEMS.map(({ id, label, icon }) => {
        const isActive = id === activeItem;
        return (
          <button
            key={id}
            onClick={() => onSelect(id)}
            aria-label={label}
            aria-pressed={isActive}
            className={`relative flex h-11 w-11 cursor-pointer flex-col items-center justify-center gap-0.5 font-mono text-[8px] tracking-[0.12em] transition-colors ${
              isActive ? 'text-ink' : 'text-ink-faint hover:text-ink-dim'
            }`}
          >
            {/* Hot accent bar on left edge */}
            {isActive && (
              <span className="absolute bottom-2 left-0 top-2 w-0.5 bg-hot" />
            )}
            <span className="h-[18px] w-[18px]">{icon}</span>
            <span>{label}</span>
          </button>
        );
      })}
      <div className="flex-1" />
    </div>
  );
}
