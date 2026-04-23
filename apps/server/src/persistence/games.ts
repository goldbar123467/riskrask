/**
 * Authoritative games.state snapshot writer.
 *
 * The Room persists every applied action to `turn_events` (append-only)
 * and, via this module, also updates `games.state` with the latest
 * snapshot. Writes are debounced per-gameId (default 1 s) so a blitz
 * chain of 10+ captures produces one DB write, not ten. A final flush
 * is forced on turn-advance + on game-over by the caller.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

type AnyClient = SupabaseClient;

export interface SnapshotInput {
  readonly gameId: string;
  readonly state: unknown;
  readonly turnNumber: number;
  readonly turnPhase: string;
  readonly lastHash: string;
}

export interface SnapshotWriterOpts {
  readonly debounceMs?: number;
  /** Overrideable setTimeout — injected by tests. */
  readonly setTimeoutFn?: typeof setTimeout;
  readonly clearTimeoutFn?: typeof clearTimeout;
}

interface PendingWrite {
  readonly input: SnapshotInput;
  readonly handle: ReturnType<typeof setTimeout>;
}

export class GameSnapshotWriter {
  private readonly client: AnyClient;
  private readonly debounceMs: number;
  private readonly setTimeoutFn: typeof setTimeout;
  private readonly clearTimeoutFn: typeof clearTimeout;
  private readonly pending = new Map<string, PendingWrite>();

  constructor(client: AnyClient, opts: SnapshotWriterOpts = {}) {
    this.client = client;
    this.debounceMs = opts.debounceMs ?? 1_000;
    this.setTimeoutFn = opts.setTimeoutFn ?? setTimeout;
    this.clearTimeoutFn = opts.clearTimeoutFn ?? clearTimeout;
  }

  /** Schedule a debounced snapshot. Overwrites any previously-queued write for the same gameId. */
  queue(input: SnapshotInput): void {
    const existing = this.pending.get(input.gameId);
    if (existing) this.clearTimeoutFn(existing.handle);
    const handle = this.setTimeoutFn(() => {
      void this.flushOne(input);
    }, this.debounceMs);
    // Bun + Node: don't keep event loop alive for pending writes.
    const h = handle as unknown as { unref?: () => void };
    if (typeof h.unref === 'function') h.unref();
    this.pending.set(input.gameId, { input, handle });
  }

  /** Flush any queued snapshot for gameId immediately. Safe to call when nothing is queued. */
  async flush(gameId: string): Promise<void> {
    const entry = this.pending.get(gameId);
    if (!entry) return;
    this.clearTimeoutFn(entry.handle);
    this.pending.delete(gameId);
    await this.flushOne(entry.input);
  }

  /** Force-write without the debounce. Used on turn-advance + game-over. */
  async writeNow(input: SnapshotInput): Promise<void> {
    const existing = this.pending.get(input.gameId);
    if (existing) {
      this.clearTimeoutFn(existing.handle);
      this.pending.delete(input.gameId);
    }
    await this.flushOne(input);
  }

  /** Stop every pending timer. Used on process shutdown. */
  shutdown(): void {
    for (const entry of this.pending.values()) this.clearTimeoutFn(entry.handle);
    this.pending.clear();
  }

  private async flushOne(input: SnapshotInput): Promise<void> {
    try {
      const { error } = await this.client
        .from('games')
        .update({
          state: input.state as Record<string, unknown>,
          turn_number: input.turnNumber,
          turn_phase: input.turnPhase,
          last_hash: input.lastHash,
        })
        .eq('id', input.gameId);
      if (error) {
        console.warn('[games-snapshot] update failed', { gameId: input.gameId, err: error.message });
      }
    } catch (err) {
      console.warn('[games-snapshot] update threw', {
        gameId: input.gameId,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
