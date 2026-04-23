/**
 * Per-room turn timer.
 *
 * Owns one `setTimeout` per roomId. When the timer fires the configured
 * `onExpire` callback runs — the registry uses this to drive AI takeover
 * (AI seat) or force-advance (human seat) on the authoritative Room.
 *
 * The timer is restarted on every "active segment advance" — either a seat
 * rotation OR an intra-turn phase flip (reinforce -> attack -> fortify). That
 * guarantees humans always see a fresh 30s countdown at the start of each
 * segment, not a single countdown that drains across all three phases of
 * their turn. See `Room.applyIntent` for where the advance is detected.
 *
 * All scheduling primitives are injectable so unit tests can run on a
 * synthetic clock.
 */

export interface TurnDriverDeps {
  now: () => number;
  setTimeout: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimeout: (handle: ReturnType<typeof setTimeout>) => void;
}

interface Entry {
  handle: ReturnType<typeof setTimeout>;
  deadlineMs: number;
  onExpire: () => void;
}

export class TurnDriver {
  private readonly now: () => number;
  private readonly setTimeoutFn: TurnDriverDeps['setTimeout'];
  private readonly clearTimeoutFn: TurnDriverDeps['clearTimeout'];
  private readonly timers: Map<string, Entry> = new Map();

  constructor(deps?: Partial<TurnDriverDeps>) {
    this.now = deps?.now ?? (() => Date.now());
    this.setTimeoutFn =
      deps?.setTimeout ??
      ((fn, ms) => setTimeout(fn, ms) as unknown as ReturnType<typeof setTimeout>);
    this.clearTimeoutFn = deps?.clearTimeout ?? ((h) => clearTimeout(h));
  }

  /**
   * (Re)schedule the expiry callback for `roomId`. Clears any existing
   * timer for that room first so callers can freely restart on turn
   * advance without double-firing.
   */
  start(roomId: string, durationMs: number, onExpire: () => void): void {
    this.cancel(roomId);
    const deadlineMs = this.now() + durationMs;
    const handle = this.setTimeoutFn(() => {
      // Drop the entry BEFORE firing so a re-entrant start() inside
      // onExpire doesn't get cancelled by our own clear call.
      this.timers.delete(roomId);
      try {
        onExpire();
      } catch (err) {
        console.warn('[turnDriver] onExpire threw', {
          roomId,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }, durationMs);
    this.timers.set(roomId, { handle, deadlineMs, onExpire });
  }

  cancel(roomId: string): void {
    const existing = this.timers.get(roomId);
    if (!existing) return;
    this.clearTimeoutFn(existing.handle);
    this.timers.delete(roomId);
  }

  /** Absolute expiry ms (per injected `now`) or null if nothing scheduled. */
  getDeadline(roomId: string): number | null {
    const entry = this.timers.get(roomId);
    return entry ? entry.deadlineMs : null;
  }

  /** Stop every timer. Used on process shutdown. */
  shutdown(): void {
    for (const entry of this.timers.values()) this.clearTimeoutFn(entry.handle);
    this.timers.clear();
  }
}
