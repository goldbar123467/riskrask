import type { ReactNode } from 'react';
import { useState } from 'react';

interface ResponsiveShellProps {
  brand: ReactNode;
  topbar: ReactNode;
  rail: ReactNode;
  stage: ReactNode;
  dossier: ReactNode;
  statusbar: ReactNode;
}

/**
 * Responsive wrapper around Shell.
 * ≥900px: full desktop grid (72px rail | 1fr stage | 380px dossier).
 * <900px: Rail becomes top tab strip, Dossier becomes bottom sheet with toggle.
 */
export function ResponsiveShell(props: ResponsiveShellProps) {
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <>
      {/* Desktop layout */}
      <div className="hidden h-screen w-screen min-[900px]:block">
        <DesktopShell {...props} />
      </div>

      {/* Mobile layout */}
      <div className="flex h-screen w-screen flex-col max-[899px]:flex max-[899px]:flex-col min-[900px]:hidden">
        {/* Top: brand + topbar */}
        <div
          className="flex shrink-0 items-stretch border-b border-line bg-bg-1"
          style={{ height: 56 }}
        >
          <div className="w-14 shrink-0 border-r border-line">{props.brand}</div>
          <div className="flex-1">{props.topbar}</div>
        </div>

        {/* Rail as top tab strip */}
        <div
          className="flex shrink-0 items-center gap-0 border-b border-line bg-bg-1 overflow-x-auto"
          style={{ height: 40 }}
        >
          {props.rail}
        </div>

        {/* Stage takes full width */}
        <div className="relative flex-1 overflow-hidden">{props.stage}</div>

        {/* Statusbar */}
        <div className="shrink-0 border-t border-line bg-bg-1" style={{ height: 48 }}>
          {props.statusbar}
        </div>

        {/* Dossier toggle button */}
        <button
          type="button"
          data-testid="dossier-toggle"
          onClick={() => setSheetOpen((v) => !v)}
          className="fixed bottom-12 right-3 z-30 flex h-8 w-8 items-center justify-center border border-hot bg-bg-0 font-mono text-sm text-hot"
        >
          {sheetOpen ? '↓' : '↑'}
        </button>

        {/* Dossier bottom sheet */}
        {sheetOpen && (
          <div
            data-testid="dossier-sheet"
            className="fixed inset-x-0 bottom-12 z-20 max-h-[60vh] overflow-y-auto border-t border-line bg-panel"
          >
            {props.dossier}
          </div>
        )}
      </div>
    </>
  );
}

function DesktopShell({ brand, topbar, rail, stage, dossier, statusbar }: ResponsiveShellProps) {
  return (
    <div
      className="h-screen w-screen overflow-hidden bg-bg-0"
      style={{
        display: 'grid',
        gridTemplateColumns: '72px 1fr 380px',
        gridTemplateRows: '56px 1fr 48px',
        gridTemplateAreas: `
          "brand  topbar  topbar"
          "rail   stage   dossier"
          "rail   statusbar statusbar"
        `,
      }}
    >
      <div
        aria-label="brand"
        style={{ gridArea: 'brand' }}
        className="border-b border-r border-line bg-bg-1"
      >
        {brand}
      </div>
      <div
        aria-label="topbar"
        style={{ gridArea: 'topbar' }}
        className="border-b border-line bg-bg-1"
      >
        {topbar}
      </div>
      <div aria-label="rail" style={{ gridArea: 'rail' }} className="border-r border-line bg-bg-1">
        {rail}
      </div>
      <div aria-label="stage" style={{ gridArea: 'stage' }} className="relative overflow-hidden">
        {stage}
      </div>
      <div
        aria-label="dossier"
        style={{ gridArea: 'dossier' }}
        className="overflow-y-auto border-l border-line bg-panel"
      >
        {dossier}
      </div>
      <div
        aria-label="statusbar"
        style={{ gridArea: 'statusbar' }}
        className="border-t border-line bg-bg-1"
      >
        {statusbar}
      </div>
    </div>
  );
}
