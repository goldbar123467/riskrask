/**
 * In-memory authoritative Room.
 *
 * Owns:
 *   - the current engine GameState
 *   - seat roster + per-seat send callbacks
 *   - sequence number + hash chain for desync detection
 *   - an RNG derived deterministically from the room code (server-side
 *     authoritative dice — the engine's own RNG already handles internal
 *     dice, but downstream features like map-seed re-rolls need one)
 *
 * Does NOT own:
 *   - networking — takes send callbacks; never touches ws directly
 *   - persistence — takes a writer fn; never imports Supabase
 */

import { EngineError, apply, createRng } from '@riskrask/engine';
import type { Action, Effect, GameState, Rng } from '@riskrask/engine';
import type { ServerMsg } from '@riskrask/shared';
import { hashGameState } from './hash';
import type { Seat } from './seat';
import { Timer } from './timer';

// ---------------------------------------------------------------------------
// Dependency types (injectable for tests)
// ---------------------------------------------------------------------------

export type SendFn = (msg: ServerMsg) => void;
export type CloseFn = (code?: number, reason?: string) => void;

/** Signature of the AI fallback driver — injected to break an import cycle. */
export type RunFallbackFn = (room: Room, seatIdx: number) => Promise<void>;

export interface AttachedSocket {
  send: SendFn;
  close?: CloseFn;
}

export interface TurnLogger {
  write(input: {
    roomId: string;
    gameId: string;
    seq: number;
    turn: number;
    actorId: string | null;
    action: unknown;
    hash: string;
  }): Promise<void>;
}

export interface RoomEventLogEntry {
  readonly seq: number;
  readonly turn: number;
  readonly actorId: string | null;
  readonly action: Action;
  readonly hash: string;
  /**
   * Effects produced by this action. Carried on the log so a late-joining
   * client can be fed `applied` frames with the same effects the original
   * broadcast had. Not persisted by `turn_events` (that table only stores
   * hash chain + action); see `turn-log.ts`.
   */
  readonly effects: readonly Effect[];
}

export class RoomError extends Error {
  readonly code: string;
  readonly detail?: string;
  constructor(code: string, detail?: string) {
    super(detail ?? code);
    this.code = code;
    if (detail !== undefined) this.detail = detail;
  }
}

// ---------------------------------------------------------------------------
// Room
// ---------------------------------------------------------------------------

export class Room {
  readonly roomId: string;
  readonly gameId: string;
  readonly rng: Rng;

  private state: GameState;
  private hash: string;
  private seq: number;
  private seats: Seat[];
  private sendFns: Map<number, SendFn> = new Map();
  private closeFns: Map<number, CloseFn> = new Map();
  private eventLog: RoomEventLogEntry[] = [];
  private timer: Timer;
  private logger: TurnLogger | null;
  private disconnectGrace: Map<number, number> = new Map();
  private terminated = false;

  /** Fired once when the engine first declares a winner. */
  private readonly onGameOver: ((winnerPlayerId: string, finalState: GameState) => void) | null;
  /** Fired on currentPlayerIdx change so the registry can restart its turn timer. */
  private readonly onTurnAdvance: ((roomId: string) => void) | null;
  /** Used by the Room to look up the active turn deadline for the welcome frame. */
  private readonly getDeadline: ((roomId: string) => number | null) | null;
  /** Injected AI driver — runs when a new turn lands on an AI seat. */
  private readonly runFallback: RunFallbackFn | null;
  /** Fired after every applied action. Null when no snapshot writer is wired up. */
  private readonly onSnapshot:
    | ((snapshot: {
        state: GameState;
        hash: string;
        seq: number;
        turnAdvanced: boolean;
        winner: string | null;
      }) => void)
    | null;

  /** ms after a seat disconnects before it's flagged AFK for AI takeover. */
  readonly disconnectGraceMs: number;

  /**
   * Injectable clock. The Room forwards this to its `Timer` and uses it for
   * the disconnect-grace stopwatch. Tests can pass a deterministic counter
   * instead of `performance.now`. Defaults to `performance.now`.
   */
  private readonly now: () => number;

  constructor(
    roomId: string,
    gameId: string,
    initialState: GameState,
    seats: Seat[],
    opts: {
      roomCode?: string;
      logger?: TurnLogger;
      disconnectGraceMs?: number;
      now?: () => number;
      onGameOver?: (winnerPlayerId: string, finalState: GameState) => void;
      /**
       * Called every time `currentPlayerIdx` changes on a successful
       * applyIntent. The registry uses this to restart its per-room
       * TurnDriver countdown.
       */
      onTurnAdvance?: (roomId: string) => void;
      /** Reader for the current turn deadline — used when composing welcome frames. */
      getTurnDeadline?: (roomId: string) => number | null;
      /**
       * Injection point for the AI fallback. Runs microtask-queued when a
       * turn advance lands on an AI seat. Kept optional so direct Room unit
       * tests can opt out.
       */
      runFallback?: RunFallbackFn;
      /** Fired after every applied action. Registry wires this to the debounced snapshot writer. */
      onSnapshot?: (snapshot: {
        state: GameState;
        hash: string;
        seq: number;
        turnAdvanced: boolean;
        winner: string | null;
      }) => void;
    } = {},
  ) {
    this.roomId = roomId;
    this.gameId = gameId;
    this.state = initialState;
    this.hash = hashGameState(initialState);
    this.seq = 0;
    this.seats = seats.slice();
    this.rng = createRng(`${opts.roomCode ?? roomId}:room`);
    this.logger = opts.logger ?? null;
    this.disconnectGraceMs = opts.disconnectGraceMs ?? 15_000;
    this.now = opts.now ?? (() => performance.now());
    this.timer = new Timer(undefined, undefined, this.now);
    this.timer.start();
    this.onGameOver = opts.onGameOver ?? null;
    this.onTurnAdvance = opts.onTurnAdvance ?? null;
    this.getDeadline = opts.getTurnDeadline ?? null;
    this.runFallback = opts.runFallback ?? null;
    this.onSnapshot = opts.onSnapshot ?? null;
  }

  // ---- read-only accessors (used by tests & fallback) --------------------
  getState(): GameState {
    return this.state;
  }
  getHash(): string {
    return this.hash;
  }
  getSeq(): number {
    return this.seq;
  }
  getSeats(): readonly Seat[] {
    return this.seats;
  }
  getEventLog(): readonly RoomEventLogEntry[] {
    return this.eventLog;
  }
  getSeat(seatIdx: number): Seat | undefined {
    return this.seats.find((s) => s.seatIdx === seatIdx);
  }

  /**
   * Bulk-load prior events — used by `ensureHydrated` to rebuild the
   * in-memory event log after a server restart. Entries from DB don't carry
   * effects (we never recompute them), so late-joiners that ask for a delta
   * earlier than the snapshot will only see the action + hash slots.
   *
   * Idempotent: safe to call twice but only the first call populates.
   */
  hydrateEventLog(entries: readonly RoomEventLogEntry[]): void {
    if (this.eventLog.length > 0) return;
    this.eventLog = entries.slice();
    const lastEntry = entries[entries.length - 1];
    if (lastEntry && lastEntry.seq > this.seq) {
      this.seq = lastEntry.seq;
      this.hash = lastEntry.hash;
    }
  }

  // ---- presence ---------------------------------------------------------
  /**
   * Register a socket for `seatIdx`. Two signatures are supported:
   *  - `attach(seatIdx, sendFn)` — legacy; still used by tests.
   *  - `attach(seatIdx, { send, close })` — production; stores a close
   *    callback so `shutdown()` can terminate the socket on game over.
   */
  attach(seatIdx: number, sock: SendFn | AttachedSocket): void {
    const send: SendFn = typeof sock === 'function' ? sock : sock.send;
    const close: CloseFn | undefined = typeof sock === 'function' ? undefined : sock.close;
    this.sendFns.set(seatIdx, send);
    if (close) this.closeFns.set(seatIdx, close);
    else this.closeFns.delete(seatIdx);
    this.disconnectGrace.delete(seatIdx);
    const seat = this.getSeat(seatIdx);
    if (seat) {
      seat.connected = true;
      seat.afk = false;
    }
    this.broadcast({ type: 'presence', seatIdx, connected: true });
  }

  detach(seatIdx: number): void {
    this.sendFns.delete(seatIdx);
    this.closeFns.delete(seatIdx);
    const seat = this.getSeat(seatIdx);
    if (seat) {
      seat.connected = false;
    }
    this.disconnectGrace.set(seatIdx, this.now());
    this.broadcast({ type: 'presence', seatIdx, connected: false });
  }

  /** True once `shutdown()` has been called. Intent handlers reject. */
  isTerminated(): boolean {
    return this.terminated;
  }

  /**
   * Expose the current turn's absolute deadline (epoch-ms) — readers are the
   * WS handler composing welcome frames and the applyIntent broadcaster
   * adding `deadlineMs` to `turn_advance`. Returns null when no TurnDriver
   * is wired up or when the Room is terminated.
   */
  getTurnDeadline(): number | null {
    if (this.terminated) return null;
    if (!this.getDeadline) return null;
    return this.getDeadline(this.roomId);
  }

  /**
   * Close every attached socket, drop send callbacks, stop the phase timer,
   * flip the `terminated` flag. Idempotent.
   */
  shutdown(_reason: 'game-over' | 'manual' = 'manual'): void {
    if (this.terminated) return;
    this.terminated = true;
    for (const [seatIdx, close] of this.closeFns) {
      try {
        close(1000, 'room closed');
      } catch (err) {
        console.warn('[room] close threw during shutdown', {
          roomId: this.roomId,
          seatIdx,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }
    this.closeFns.clear();
    this.sendFns.clear();
  }

  sendTo(seatIdx: number, msg: ServerMsg): void {
    const send = this.sendFns.get(seatIdx);
    if (!send) return;
    try {
      send(msg);
    } catch {
      // Broken send; drop silently — detach on the next tick will clean up.
    }
  }

  broadcast(msg: ServerMsg): void {
    for (const [, send] of this.sendFns) {
      try {
        send(msg);
      } catch {
        // Ignore send errors; disconnected sockets get cleaned up via detach.
      }
    }
  }

  // ---- authoritative action pipeline ------------------------------------
  /**
   * Apply an Action on behalf of `seatIdx`. Throws RoomError on phase /
   * seat / engine violation. Broadcasts `applied` on success.
   */
  async applyIntent(
    seatIdx: number,
    action: Action,
    clientHash?: string,
    expectedUserId?: string,
  ): Promise<{ nextHash: string; seq: number; effects: Effect[] }> {
    if (this.terminated) {
      throw new RoomError('GAME_TERMINATED', 'room is closed');
    }

    // Optional client hash check (advisory — we still apply).
    if (clientHash !== undefined && clientHash !== this.hash) {
      this.sendTo(seatIdx, { type: 'desync', reason: 'client-hash-mismatch' });
    }

    this.assertSeatIsCurrent(seatIdx, action);

    if (expectedUserId !== undefined) {
      const seat = this.getSeat(seatIdx);
      if (!seat) throw new RoomError('UNKNOWN_SEAT', `seat ${seatIdx} missing`);
      if (seat.userId !== expectedUserId) {
        throw new RoomError(
          'SEAT_USER_MISMATCH',
          `seat ${seatIdx} belongs to ${seat.userId ?? 'ai/none'}, not ${expectedUserId}`,
        );
      }
    }

    const prevSeatIdx = this.state.currentPlayerIdx;
    const prevWinner = this.state.winner;

    let result: { next: GameState; effects: Effect[] };
    try {
      result = apply(this.state, action);
    } catch (err) {
      if (err instanceof EngineError) {
        throw new RoomError(err.code, err.message);
      }
      throw new RoomError('ENGINE_ERROR', err instanceof Error ? err.message : 'unknown');
    }

    this.state = result.next;
    this.hash = hashGameState(this.state);
    this.seq += 1;

    const seat = this.getSeat(seatIdx);
    const actorId = seat?.userId ?? null;
    const entry: RoomEventLogEntry = {
      seq: this.seq,
      turn: this.state.turn,
      actorId,
      action,
      hash: this.hash,
      effects: result.effects,
    };
    this.eventLog.push(entry);

    // Best-effort persistence — server must not crash on DB hiccups.
    if (this.logger) {
      try {
        await this.logger.write({
          roomId: this.roomId,
          gameId: this.gameId,
          seq: entry.seq,
          turn: entry.turn,
          actorId,
          action,
          hash: this.hash,
        });
      } catch (err) {
        console.warn('[room] turn_events write failed', {
          roomId: this.roomId,
          seq: entry.seq,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }

    this.broadcast({
      type: 'applied',
      seq: this.seq,
      action,
      nextHash: this.hash,
      effects: result.effects,
    });

    const nextSeatIdx = this.state.currentPlayerIdx;
    const advanced = nextSeatIdx !== prevSeatIdx;

    if (advanced) {
      // Let the registry restart its per-room countdown BEFORE we read the
      // deadline for the broadcast frame.
      if (this.onTurnAdvance) {
        try {
          this.onTurnAdvance(this.roomId);
        } catch (err) {
          console.warn('[room] onTurnAdvance threw', {
            roomId: this.roomId,
            err: err instanceof Error ? err.message : String(err),
          });
        }
      }
      const deadlineMs = this.getTurnDeadline() ?? Date.now();
      this.broadcast({
        type: 'turn_advance',
        currentSeatIdx: nextSeatIdx,
        turnNumber: this.state.turn,
        deadlineMs,
      });

      // New turn landed on an AI seat → microtask-queue the fallback so the
      // caller's promise resolves first (keeps applyIntent call stacks shallow).
      const nextSeat = this.seats[nextSeatIdx];
      if (nextSeat?.isAi && this.runFallback && !this.state.winner) {
        const driver = this.runFallback;
        const idx = nextSeatIdx;
        queueMicrotask(() => {
          void driver(this, idx).catch((err) => {
            console.warn('[room] auto AI fallback failed', {
              roomId: this.roomId,
              seatIdx: idx,
              err: err instanceof Error ? err.message : String(err),
            });
          });
        });
      }
    }

    if (!prevWinner && this.state.winner && !this.terminated) {
      const winner = this.state.winner;
      // Fire exactly once — guarded by the terminated flag the handler
      // flips via shutdown().
      try {
        this.onGameOver?.(winner, this.state);
      } catch (err) {
        console.warn('[room] onGameOver threw', {
          roomId: this.roomId,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }

    try {
      this.onSnapshot?.({
        state: this.state,
        hash: this.hash,
        seq: this.seq,
        turnAdvanced: advanced,
        winner: this.state.winner ?? null,
      });
    } catch (err) {
      console.warn('[room] onSnapshot threw', {
        roomId: this.roomId,
        err: err instanceof Error ? err.message : String(err),
      });
    }

    return { nextHash: this.hash, seq: this.seq, effects: result.effects };
  }

  // ---- tick -------------------------------------------------------------
  /**
   * Called periodically (~1Hz) by the registry. Returns a list of seats
   * flagged AFK this tick so the caller can trigger AI fallback without the
   * Room needing to depend on @riskrask/ai directly.
   */
  tick(now: number = this.now()): number[] {
    const newlyAfk: number[] = [];

    // Promote disconnected-long seats to AFK.
    for (const [seatIdx, since] of this.disconnectGrace) {
      if (now - since >= this.disconnectGraceMs) {
        const seat = this.getSeat(seatIdx);
        if (seat && !seat.afk) {
          seat.afk = true;
          newlyAfk.push(seatIdx);
        }
        this.disconnectGrace.delete(seatIdx);
      }
    }

    // If the current player's timer has burned down and they're AFK (or their
    // seat is already AI), hand them to the fallback on their turn.
    const current = this.state.players[this.state.currentPlayerIdx];
    if (current) {
      const seat = this.seats[this.state.currentPlayerIdx];
      if (seat && (seat.afk || seat.isAi) && this.timer.isExpired(now)) {
        if (!newlyAfk.includes(seat.seatIdx)) newlyAfk.push(seat.seatIdx);
      }
    }

    return newlyAfk;
  }

  /** For internal use by fallback — bypass the seat ownership check. */
  async applyAsCurrent(
    action: Action,
  ): Promise<{ nextHash: string; seq: number; effects: Effect[] }> {
    const idx = this.state.currentPlayerIdx;
    return this.applyIntent(idx, action);
  }

  // -----------------------------------------------------------------------
  private assertSeatIsCurrent(seatIdx: number, action: Action): void {
    const idx = this.state.currentPlayerIdx;
    // Setup-claim / setup-reinforce / reinforce / attack / fortify all
    // require that seat === currentPlayerIdx. The engine will enforce
    // WRONG_PHASE on top of that, so this is just a fast-fail.
    if (seatIdx !== idx) {
      throw new RoomError(
        'NOT_YOUR_TURN',
        `seat ${seatIdx} attempted ${action.type} during seat ${idx}'s turn`,
      );
    }
    const seat = this.getSeat(seatIdx);
    if (!seat) {
      throw new RoomError('UNKNOWN_SEAT', `seat ${seatIdx} is not part of this room`);
    }
  }
}
