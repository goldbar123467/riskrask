interface ZoomControlProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  disabled?: boolean | undefined;
}

/**
 * +/- + fit buttons at bottom-right of stage. Disabled during Setup phase.
 */
export function ZoomControl({ onZoomIn, onZoomOut, onFit, disabled }: ZoomControlProps) {
  const isDisabled = disabled === true;
  return (
    <div className="absolute bottom-4 right-4 z-10 flex flex-col gap-1">
      <ZBtn onClick={onZoomIn} disabled={isDisabled} title="Zoom in">
        +
      </ZBtn>
      <ZBtn onClick={onFit} disabled={isDisabled} title="Fit" className="text-[9px]">
        FIT
      </ZBtn>
      <ZBtn onClick={onZoomOut} disabled={isDisabled} title="Zoom out">
        −
      </ZBtn>
    </div>
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
