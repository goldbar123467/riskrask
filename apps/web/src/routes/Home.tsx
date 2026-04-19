export function Home() {
  return (
    <main className="flex h-full flex-col items-center justify-center gap-6 bg-bg-0 p-8 text-center">
      <div className="flex items-center gap-4">
        <div className="relative h-7 w-7">
          <div className="absolute inset-0 rotate-45 border border-ink" />
          <div
            className="absolute left-[11px] top-[11px] h-[6px] w-[6px] bg-hot"
            style={{ boxShadow: '0 0 12px var(--hot-glow)' }}
          />
        </div>
        <h1 className="font-display text-sm tracking-[0.36em] text-ink">RISK</h1>
        <span className="font-mono text-[10px] tracking-[0.12em] text-ink-faint">v3 · CONSOLE</span>
      </div>
      <p className="font-display text-xl tracking-widest text-ink-dim">Command Console</p>
      <p className="font-mono text-xs tracking-widest text-ink-faint">
        scaffold — full UI arrives with Track D
      </p>
    </main>
  );
}
