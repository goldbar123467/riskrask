/**
 * 72×56 brand corner: rotated-square mark with hot-accent inner dot.
 * Pure presentational — no store reads.
 */
export function Brand() {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="relative h-7 w-7">
        {/* Outer rotated square */}
        <div className="absolute inset-0 rotate-45 border border-ink" />
        {/* Hot-accent inner dot */}
        <div
          className="absolute h-[6px] w-[6px] bg-hot"
          style={{ top: 11, left: 11, boxShadow: '0 0 12px var(--hot-glow)' }}
        />
      </div>
    </div>
  );
}
