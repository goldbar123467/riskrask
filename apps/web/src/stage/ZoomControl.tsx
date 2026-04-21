interface ZoomControlProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  /** Current scale for the readout chip. Defaults to 1.0 if not supplied. */
  scale?: number;
  disabled?: boolean | undefined;
}

/**
 * +/– buttons with scale readout and a fit/maximize button at bottom-right.
 * Matches the command-console mockup vertical stack.
 */
export function ZoomControl({ onZoomIn, onZoomOut, onFit, scale = 1, disabled }: ZoomControlProps) {
  const isDisabled = disabled === true;
  const readout = `${scale.toFixed(1)}×`;
  return (
    <div className="absolute bottom-4 right-4 z-10 flex flex-col gap-1">
      <ZBtn onClick={onZoomIn} disabled={isDisabled} title="Zoom in">
        +
      </ZBtn>
      <div
        className="flex h-6 w-7 items-center justify-center border border-line bg-panel/80 font-mono text-[9px] text-ink-dim"
        aria-label={`Zoom ${readout}`}
      >
        {readout}
      </div>
      <ZBtn onClick={onZoomOut} disabled={isDisabled} title="Zoom out">
        −
      </ZBtn>
      <ZBtn onClick={onFit} disabled={isDisabled} title="Fit to view">
        <FitIcon />
      </ZBtn>
    </div>
  );
}

function FitIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <path
        d="M 0.5 3 L 0.5 0.5 L 3 0.5 M 7 0.5 L 9.5 0.5 L 9.5 3 M 9.5 7 L 9.5 9.5 L 7 9.5 M 3 9.5 L 0.5 9.5 L 0.5 7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
      />
    </svg>
  );
}

function ZBtn({
  onClick,
  disabled,
  title,
  children,
  className = '',
}: {
  onClick: () => void;
  disabled?: boolean | undefined;
  title?: string | undefined;
  children: React.ReactNode;
  className?: string | undefined;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`flex h-7 w-7 cursor-pointer items-center justify-center border border-line bg-panel/80 font-mono text-sm text-ink-dim hover:border-line-2 hover:text-ink disabled:cursor-not-allowed disabled:opacity-30 ${className}`}
    >
      {children}
    </button>
  );
}
