interface CommanderCardProps {
  name: string;
  tag: string;
  color: string;
}

/**
 * Commander crest card: faction color swatch + name + tag row.
 */
export function CommanderCard({ name, tag, color }: CommanderCardProps) {
  return (
    <div
      className="flex items-center gap-3 border-b border-line px-4 py-3"
      aria-label="commander-card"
    >
      {/* Crest: rotated square with faction color */}
      <div
        className="relative flex h-8 w-8 shrink-0 items-center justify-center"
      >
        <div
          className="absolute h-6 w-6 rotate-45 border"
          style={{ borderColor: color }}
        />
        <div
          className="absolute h-2 w-2"
          style={{ background: color, boxShadow: `0 0 8px ${color}` }}
        />
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-[13px] font-medium text-ink">{name}</p>
        <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-ink-faint">{tag}</p>
      </div>
    </div>
  );
}
