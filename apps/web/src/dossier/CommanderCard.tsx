interface CommanderCardProps {
  name: string;
  tag: string;
  color: string;
  /**
   * When non-null, overrides the tag to show that the human is waiting on
   * another player (remote human or AI) to finish their turn. Pass the other
   * player's display name. Pass null (or omit) during the human's own turn.
   */
  waitingFor?: string | null;
}

/**
 * Commander crest card: faction color swatch + name + tag row.
 * The inner crest dot pulses gently with the faction colour.
 */
export function CommanderCard({ name, tag, color, waitingFor }: CommanderCardProps) {
  return (
    <div
      className="flex items-center gap-3 border-b border-line px-4 py-3"
      aria-label="commander-card"
      data-waiting={waitingFor ? 'true' : 'false'}
    >
      {/* Crest: rotated square with faction color */}
      <div className="relative flex h-8 w-8 shrink-0 items-center justify-center">
        <div className="absolute h-6 w-6 rotate-45 border" style={{ borderColor: color }} />
        <div
          className="rr-anim-pulseGlow absolute h-2 w-2"
          style={
            {
              background: color,
              boxShadow: `0 0 8px ${color}`,
              animation: 'pulseGlow 1800ms ease-in-out infinite',
              ['--hot-glow' as string]: `${color}55`,
            } as React.CSSProperties
          }
        />
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-[13px] font-medium text-ink">{name}</p>
        <p className="truncate font-mono text-[9px] uppercase tracking-[0.16em] text-ink-faint">
          {tag}
          {waitingFor ? ` · waiting for ${waitingFor}` : ''}
        </p>
      </div>
    </div>
  );
}
