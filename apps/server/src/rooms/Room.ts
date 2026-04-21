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
  private eventLog: RoomEventLogEntry[] = [];
  private timer: Timer = new Timer();
  private logger: TurnLogger | null;
  private disconnectGrace: Map<number, number> = new Map();

  /** ms after a seat disconnects before it's flagged AFK for AI takeover. */
  readonly disconnectGraceMs: number;

  constructor(
    roomId: string,
    gameId: string,
    initialState: GameState,
    seats: Seat[],
    opts: {
      roomCode?: string;
      logger?: TurnLogger;
      disconnectGraceMs?: number;
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
    this.timer.start();
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

  // ---- presence ---------------------------------------------------------
  attach(seatIdx: number, send: SendFn): void {
    this.sendFns.set(seatIdx, send);
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
    const seat = this.getSeat(seatIdx);
    if (seat) {
      seat.connected = false;
    }
    this.disconnectGrace.set(seatIdx, performance.now());
    this.broadcast({ type: 'presence', seatIdx, connected: false });
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
  ): Promise<{ nextHash: string; seq: number; effects: Effect[] }> {
    // Optional client hash check (advisory — we still apply).
    if (clientHash !== undefined && clientHash !== this.hash) {
      this.sendTo(seatIdx, { type: 'desync', reason: 'client-hash-mismatch' });
    }

    this.assertSeatIsCurrent(seatIdx, action);

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

    // Restart timer for the (possibly new) active seat.
    this.timer.start();

    return { nextHash: this.hash, seq: this.seq, effects: result.effects };
  }

  // ---- tick -------------------------------------------------------------
  /**
   * Called periodically (~1Hz) by the registry. Returns a list of seats
   * flagged AFK this tick so the caller can trigger AI fallback without the
   * Room needing to depend on @riskrask/ai directly.
   */
  tick(now: number = performance.now()): number[] {
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
