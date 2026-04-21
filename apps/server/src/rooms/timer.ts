/**
 * Per-seat phase timer with a carry-over bank.
 *
 * Wall-clock based — explicitly OK to call `performance.now()` here;
 * the timer is I/O-side and never feeds back into the pure engine state.
 *
 * Defaults (v1): 90s base phase + 15s bank. When a phase ends the unused
 * remainder of the phase is discarded but the bank carries across turns.
 */

const DEFAULT_PHASE_MS = 90_000;
const DEFAULT_BANK_MS = 15_000;

export class Timer {
  private phaseMs: number;
  private bankMs: number;
  private startedAt: number | null = null;
  private pausedAt: number | null = null;
  private accumulatedPauseMs = 0;

  constructor(phaseMs: number = DEFAULT_PHASE_MS, bankMs: number = DEFAULT_BANK_MS) {
    this.phaseMs = phaseMs;
    this.bankMs = bankMs;
  }

  /** Begin a new phase. Any carry-over bank is preserved. */
  start(phaseMs: number = DEFAULT_PHASE_MS, bankMs?: number): void {
    this.phaseMs = phaseMs;
    if (bankMs !== undefined) this.bankMs = bankMs;
    this.startedAt = performance.now();
    this.pausedAt = null;
    this.accumulatedPauseMs = 0;
  }

  pause(): void {
    if (this.startedAt === null) return;
    if (this.pausedAt !== null) return;
    this.pausedAt = performance.now();
  }

  resume(): void {
    if (this.pausedAt === null) return;
    const now = performance.now();
    this.accumulatedPauseMs += now - this.pausedAt;
    this.pausedAt = null;
  }

  /** Time remaining in the phase+bank, in ms. Never negative. */
  remainingMs(now: number = performance.now()): number {
    if (this.startedAt === null) return this.phaseMs + this.bankMs;
    const pauseTotal = this.accumulatedPauseMs + (this.pausedAt !== null ? now - this.pausedAt : 0);
    const elapsed = now - this.startedAt - pauseTotal;
    const total = this.phaseMs + this.bankMs;
    const remaining = total - elapsed;
    return remaining > 0 ? remaining : 0;
  }

  isExpired(now: number = performance.now()): boolean {
    return this.remainingMs(now) <= 0;
  }
}
