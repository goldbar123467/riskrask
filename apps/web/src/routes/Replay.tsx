/**
 * Replay route stub — full implementation in Track H.
 * Loads turn_events from /api/rooms/:id/turns and replays through the engine.
 */
export function Replay() {
  return (
    <main className="flex h-full flex-col items-center justify-center gap-4 bg-bg-0 text-center">
      <p className="font-display text-sm tracking-widest text-ink-dim">REPLAY</p>
      <p className="font-mono text-[10px] text-ink-ghost">Full replay viewer ships in Track H.</p>
    </main>
  );
}
