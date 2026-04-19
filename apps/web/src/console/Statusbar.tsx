type LinkStatus = 'stable' | 'lagging' | 'down';

interface StatusbarProps {
  link: LinkStatus;
  tickLabel: string;
  latencyMs: number;
  windowLabel: string;
}

const LINK_COLOR: Record<LinkStatus, string> = {
  stable: 'text-ok',
  lagging: 'text-warn',
  down: 'text-danger',
};

/**
 * Bottom statusbar: LINK / TICK / LAT / WINDOW cells.
 * Pure presentational — no store reads.
 */
export function Statusbar({ link, tickLabel, latencyMs, windowLabel }: StatusbarProps) {
  return (
    <div className="flex h-full items-stretch border-r border-line">
      <StatusCell label="LINK" value={link.toUpperCase()} valueClass={LINK_COLOR[link]} />
      <StatusCell label="TICK" value={tickLabel} />
      <StatusCell label="LAT" value={`${latencyMs}ms`} />
      <StatusCell label="WINDOW" value={windowLabel} valueClass="text-hot" />
      <div className="ml-auto flex items-center pr-4">
        <span className="font-mono text-[9px] text-ink-ghost">riskrask · v3</span>
      </div>
    </div>
  );
}

function StatusCell({
  label,
  value,
  valueClass = 'text-ink-dim',
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center gap-2 border-r border-line px-4">
      <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink-ghost">{label}</span>
      <span className={`font-mono text-[11px] tracking-[0.1em] ${valueClass}`}>{value}</span>
    </div>
  );
}
