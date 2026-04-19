import type { ReactNode } from 'react';

interface ShellProps {
  brand: ReactNode;
  topbar: ReactNode;
  rail: ReactNode;
  stage: ReactNode;
  dossier: ReactNode;
  statusbar: ReactNode;
}

/**
 * Full-bleed CSS Grid shell implementing the Command Console layout:
 * Columns: 72px | 1fr | 380px
 * Rows:    56px | 1fr | 48px
 * Areas:   brand/topbar | rail/stage/dossier | rail/statusbar
 */
export function Shell({ brand, topbar, rail, stage, dossier, statusbar }: ShellProps) {
  return (
    <div
      className="relative h-screen w-screen overflow-hidden bg-bg-0"
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
