/**
 * Singleton in-memory Room registry.
 *
 * v1: Rooms live in-process. On a 1Hz interval we call `room.tick()` and
 * delegate AFK seats to the AI fallback. Tests can inject a null interval
 * (for manual tick control) via `new RoomRegistry({ autoTick: false })`.
 *
 * S3 additions:
 *  - Per-room TurnDriver (timeout-based turn countdown).
 *  - `onGameOver` forwarded to every Room — the production singleton wires
 *    it to `endGame.handleGameOver`.
 *  - On TurnDriver expiry: AI seat → `runFallbackTurn`, human seat →
 *    synthesise the remaining phase-end actions via `room.applyAsCurrent`.
 *
 * There is exactly one `RoomRegistry` per process (`registry` below).
 */

import type { Action, GameState } from '@riskrask/engine';
import { runFallbackTurn } from '../ai/fallback';
import { GameSnapshotWriter } from '../persistence/games';
import { Room, type TurnLogger } from './Room';
import type { Seat } from './seat';
import { TurnDriver } from './turnDriver';

const DEFAULT_PHASE_TIMER_SEC = 30;

export interface RegistryOptions {
  autoTick?: boolean;
  tickIntervalMs?: number;
  logger?: TurnLogger;
  /**
   * Optional clock injection. Forwarded to every Room this registry creates.
   * Tests pass a controllable counter so phase/bank expiry is deterministic.
   */
  now?: () => number;
  /** Replaceable turn timer — tests inject fake clocks. */
  turnDriver?: TurnDriver;
  /**
   * Fired when a Room first sees `state.winner`. The production wiring
   * passes `endGame.handleGameOver` bound to this registry.
   */
  onGameOver?: (roomId: string, winnerPlayerId: string, finalState: GameState) => void;
  /**
   * Debounced snapshot writer for `games.state`. Wired to every Room via the
   * `onSnapshot` hook. Injected at composition-root time via `setSnapshotWriter`
   * in production to avoid importing Supabase here. Null in tests by default.
   */
  snapshotWriter?: GameSnapshotWriter;
}

export interface CreateRoomOptions {
  roomCode?: string;
  now?: () => number;
  /** Seconds per turn. Defaults to 30. */
  phaseTimerSec?: number;
}

export class RoomRegistry {
  private rooms: Map<string, Room> = new Map();
  private tickHandle: ReturnType<typeof setInterval> | null = null;
  private logger: TurnLogger | null;
  private now: (() => number) | null;
  private readonly turnDriver: TurnDriver;
  private onGameOverHandler:
    | ((roomId: string, winnerPlayerId: string, finalState: GameState) => void)
    | null;
  /** Remembers each room's per-turn duration so we can restart on turn advance. */
  private readonly roomDurations: Map<string, number> = new Map();
  /** Maps roomId → gameId so `delete(roomId)` can flush the snapshot writer. */
  private readonly roomToGame: Map<string, string> = new Map();
  private snapshotWriter: GameSnapshotWriter | null;

  constructor(opts: RegistryOptions = {}) {
    this.logger = opts.logger ?? null;
    this.now = opts.now ?? null;
    this.turnDriver = opts.turnDriver ?? new TurnDriver();
    this.onGameOverHandler = opts.onGameOver ?? null;
    this.snapshotWriter = opts.snapshotWriter ?? null;
    if (opts.autoTick !== false) {
      this.tickHandle = setInterval(() => this.tickAll(), opts.tickIntervalMs ?? 1_000);
      // Node/Bun: don't keep the event loop alive just for this.
      if (typeof (this.tickHandle as unknown as { unref?: () => void }).unref === 'function') {
        (this.tickHandle as unknown as { unref: () => void }).unref();
      }
    }
  }

  /**
   * Test-only: swap the clock used for Rooms minted after this call. The
   * production caller is expected to pass `now` via the constructor; the
   * integration suite uses the singleton `registry` and needs to retro-fit
   * a controllable clock before invoking `/api/rooms/:id/launch`.
   */
  __setClockForTests(now: (() => number) | null): void {
    this.now = now;
  }

  /** Test-only: expose the TurnDriver so integration tests can observe deadlines. */
  getTurnDriver(): TurnDriver {
    return this.turnDriver;
  }

  /**
   * Wire up the end-of-game handler after construction. Split from the
   * constructor so the module that defines the handler (`endGame.ts`) can
   * import `registry` without a circular dependency.
   */
  setOnGameOver(
    handler: (roomId: string, winnerPlayerId: string, finalState: GameState) => void,
  ): void {
    this.onGameOverHandler = handler;
  }

  /**
   * Wire up the debounced `games.state` snapshot writer after construction.
   * Mirrors `setOnGameOver` — the production caller lives in
   * `apps/server/src/index.ts` where the Supabase service client is safe to
   * import. Tests that want no persistence simply skip this call.
   */
  setSnapshotWriter(writer: GameSnapshotWriter): void {
    this.snapshotWriter = writer;
  }

  get(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  list(): Room[] {
    return Array.from(this.rooms.values());
  }

  create(
    roomId: string,
    gameId: string,
    initialState: GameState,
    seats: Seat[],
    opts: CreateRoomOptions = {},
  ): Room {
    const existing = this.rooms.get(roomId);
    if (existing) return existing;
    const now = opts.now ?? this.now ?? undefined;
    const phaseTimerSec = opts.phaseTimerSec ?? DEFAULT_PHASE_TIMER_SEC;
    const durationMs = phaseTimerSec * 1_000;

    const room = new Room(roomId, gameId, initialState, seats, {
      ...(opts.roomCode !== undefined ? { roomCode: opts.roomCode } : {}),
      ...(this.logger !== null ? { logger: this.logger } : {}),
      ...(now !== undefined ? { now } : {}),
      onTurnAdvance: (id) => this.onTurnAdvance(id),
      getTurnDeadline: (id) => this.turnDriver.getDeadline(id),
      runFallback: runFallbackTurn,
      ...(this.snapshotWriter
        ? {
            onSnapshot: ({
              state,
              hash,
              seq: _seq,
              turnAdvanced,
              winner,
            }: {
              state: GameState;
              hash: string;
              seq: number;
              turnAdvanced: boolean;
              winner: string | null;
            }) => {
              const writer = this.snapshotWriter;
              if (!writer) return;
              const input = {
                gameId,
                state,
                turnNumber: state.turn,
                turnPhase: state.phase,
                lastHash: hash,
              };
              if (winner || turnAdvanced) {
                void writer.writeNow(input);
              } else {
                writer.queue(input);
              }
            },
          }
        : {}),
      onGameOver: (winnerPlayerId, finalState) => {
        if (this.onGameOverHandler) {
          try {
            this.onGameOverHandler(roomId, winnerPlayerId, finalState);
          } catch (err) {
            console.warn('[registry] onGameOver handler threw', {
              roomId,
              err: err instanceof Error ? err.message : String(err),
            });
          }
        }
      },
    });
    this.rooms.set(roomId, room);
    this.roomDurations.set(roomId, durationMs);
    this.roomToGame.set(roomId, gameId);
    this.turnDriver.start(roomId, durationMs, () => {
      void this.onTurnExpire(roomId);
    });

    // Seed 0 → the engine opens `setup-claim` with seat 0 already active.
    // If seat 0 is AI, microtask the fallback so the game doesn't stall
    // waiting for a human input.
    const firstSeat = seats[initialState.currentPlayerIdx];
    if (firstSeat?.isAi) {
      const idx = initialState.currentPlayerIdx;
      queueMicrotask(() => {
        void runFallbackTurn(room, idx).catch((err) => {
          console.warn('[registry] initial AI fallback failed', {
            roomId,
            seatIdx: idx,
            err: err instanceof Error ? err.message : String(err),
          });
        });
      });
    }
    return room;
  }

  delete(roomId: string): void {
    this.turnDriver.cancel(roomId);
    const gameId = this.roomToGame.get(roomId);
    if (gameId && this.snapshotWriter) {
      // Best-effort — don't block `delete` on the DB round-trip.
      void this.snapshotWriter.flush(gameId);
    }
    this.roomToGame.delete(roomId);
    this.roomDurations.delete(roomId);
    this.rooms.delete(roomId);
  }

  /**
   * Called by Room on every `currentPlayerIdx` change. Restarts the per-room
   * countdown with the same duration the room was created with.
   */
  onTurnAdvance(roomId: string): void {
    const duration = this.roomDurations.get(roomId);
    if (duration === undefined) return;
    const room = this.rooms.get(roomId);
    if (!room || room.isTerminated()) return;
    this.turnDriver.start(roomId, duration, () => {
      void this.onTurnExpire(roomId);
    });
  }

  /**
   * TurnDriver expiry handler. AI seat → fallback; human seat → synthesise
   * the remaining phase-end actions to hand the turn to the next player.
   *
   * Force-advance for humans is best-effort: if the engine rejects an
   * action (e.g. the seat is in `setup-claim` and has no legal move) we
   * log and move on. The tick loop will keep nudging.
   */
  async onTurnExpire(roomId: string): Promise<void> {
    const room = this.rooms.get(roomId);
    if (!room || room.isTerminated()) return;
    const state = room.getState();
    if (state.winner) return;

    const seatIdx = state.currentPlayerIdx;
    const seat = room.getSeats()[seatIdx];
    if (!seat) return;

    if (seat.isAi) {
      try {
        await runFallbackTurn(room, seatIdx);
      } catch (err) {
        console.warn('[registry] AI fallback on expire failed', {
          roomId,
          seatIdx,
          err: err instanceof Error ? err.message : String(err),
        });
      }
      return;
    }

    // Human seat — synthesize whichever actions are needed to end the
    // turn from the current phase. We re-read state between steps
    // because each apply may transition the phase (e.g. draining the
    // last reinforce flips into `attack`).
    //
    // Bounded by the longest path: reinforce → attack → fortify → end-turn.
    // We cap at 6 to prevent pathological loops (shouldn't happen given
    // the engine's monotonic phase progression).
    for (let step = 0; step < 6; step++) {
      if (room.isTerminated()) return;
      const cur = room.getState();
      if (cur.winner) return;
      if (cur.currentPlayerIdx !== seatIdx) return;
      const action = forcedActionFor(cur, room.getSeats()[seatIdx]);
      if (!action) return;
      try {
        await room.applyAsCurrent(action);
      } catch (err) {
        console.warn('[registry] force-advance apply failed', {
          roomId,
          seatIdx,
          phase: cur.phase,
          action,
          err: err instanceof Error ? err.message : String(err),
        });
        return;
      }
    }
  }

  /**
   * Call `room.tick()` on every registered room and fire the AI fallback
   * for any newly-AFK seat. Public so tests can drive ticks manually.
   */
  async tickAll(now?: number): Promise<void> {
    for (const room of this.rooms.values()) {
      if (room.isTerminated()) continue;
      const afkSeats = room.tick(now);
      for (const seatIdx of afkSeats) {
        try {
          await runFallbackTurn(room, seatIdx);
        } catch (err) {
          console.warn('[registry] AI fallback failed', {
            roomId: room.roomId,
            seatIdx,
            err: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }
  }

  /** Stop the tick loop. Used by tests and clean shutdown. */
  shutdown(): void {
    if (this.tickHandle) {
      clearInterval(this.tickHandle);
      this.tickHandle = null;
    }
    this.turnDriver.shutdown();
    this.snapshotWriter?.shutdown();
  }
}

/**
 * Pick the single next action that drains the current phase toward a
 * turn end. Caller re-invokes after each apply until the turn rotates.
 *
 *  - setup-claim — pick the first unclaimed territory so setup can't
 *    stall. A missing legal move returns null and the expiry loop bails.
 *  - setup-reinforce — dump one reserve onto the seat's first owned
 *    territory. The engine will auto-advance when reserves hit zero.
 *  - reinforce — dump ALL remaining reserves onto one owned territory;
 *    the engine flips to `attack` automatically.
 *  - attack — skip to fortify.
 *  - fortify — end turn.
 *  - done — nothing to do.
 *
 * `seat` is used only for setup-claim (we need any legal claim; the
 * engine checks current-player ownership itself).
 */
function forcedActionFor(state: GameState, _seat: Seat | undefined): Action | null {
  const player = state.players[state.currentPlayerIdx];
  if (!player) return null;
  switch (state.phase) {
    case 'setup-claim': {
      const firstUnclaimed = Object.keys(state.territories).find(
        (n) => state.territories[n]?.owner === null,
      );
      if (!firstUnclaimed) return null;
      return { type: 'claim-territory', territory: firstUnclaimed as never };
    }
    case 'setup-reinforce': {
      const firstOwned = Object.keys(state.territories).find(
        (n) => state.territories[n]?.owner === player.id,
      );
      if (!firstOwned) return null;
      return { type: 'setup-reinforce', territory: firstOwned as never };
    }
    case 'reinforce': {
      const firstOwned = Object.keys(state.territories).find(
        (n) => state.territories[n]?.owner === player.id,
      );
      if (!firstOwned) return null;
      const count = Math.max(1, player.reserves);
      return { type: 'reinforce', territory: firstOwned as never, count };
    }
    case 'attack':
      return { type: 'end-attack-phase' };
    case 'fortify':
      return { type: 'end-turn' };
    default:
      return null;
  }
}

// Singleton for production use. Tests build their own.
//
// The production `onGameOver` AND `snapshotWriter` are wired up in
// `apps/server/src/index.ts` (which knows how to import the serviceClient
// without creating a cycle back into this module) via setters — not here —
// so that this file stays a pure container for the registry. See the server
// bootstrap for the `registerOnGameOver` + `setSnapshotWriter` calls.
export const registry = new RoomRegistry({ autoTick: true });
