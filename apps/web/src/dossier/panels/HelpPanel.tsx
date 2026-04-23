/**
 * Help tab (rail icon "help"). Rules reference + keyboard shortcuts.
 *
 * Implementer agent fills this out fully.
 */
export function HelpPanel() {
  return (
    <div className="flex flex-col gap-2 border-b border-line px-4 py-3" aria-label="help-panel">
      <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-ink-faint">Help</p>
      <div className="flex flex-col gap-2 font-mono text-[10px] text-ink-dim">
        <p>Classic Risk rules apply. See below for quick reference.</p>
        <ul className="list-disc pl-4">
          <li>Space — confirm deploy / blitz attack</li>
          <li>Esc — clear selection</li>
        </ul>
      </div>
    </div>
  );
}
