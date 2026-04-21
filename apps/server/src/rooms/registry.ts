/**
 * Singleton in-memory Room registry.
 *
 * v1: Rooms live in-process. On a 1Hz interval we call `room.tick()` and
 * delegate AFK seats to the AI fallback. Tests can inject a null interval
 * (for manual tick control) via `new RoomRegistry({ autoTick: false })`.
 *
 * There is exactly one `RoomRegistry` per process (`registry` below).
 */

import type { GameState } from '@riskrask/engine';
import { runFallbackTurn } from '../ai/fallback';
import { Room, type TurnLogger } from './Room';
import type { Seat } from './seat';

export interface RegistryOptions {
  autoTick?: boolean;
  tickIntervalMs?: number;
  logger?: TurnLogger;
}

export class RoomRegistry {
  private rooms: Map<string, Room> = new Map();
  private tickHandle: ReturnType<typeof setInterval> | null = null;
  private logger: TurnLogger | null;

  constructor(opts: RegistryOptions = {}) {
    this.logger = opts.logger ?? null;
    if (opts.autoTick !== false) {
      this.tickHandle = setInterval(() => this.tickAll(), opts.tickIntervalMs ?? 1_000);
      // Node/Bun: don't keep the event loop alive just for this.
      if (typeof (this.tickHandle as unknown as { unref?: () => void }).unref === 'function') {
        (this.tickHandle as unknown as { unref: () => void }).unref();
      }
    }
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
    opts: { roomCode?: string } = {},
  ): Room {
    const existing = this.rooms.get(roomId);
    if (existing) return existing;
    const room = new Room(roomId, gameId, initialState, seats, {
      ...(opts.roomCode !== undefined ? { roomCode: opts.roomCode } : {}),
      ...(this.logger !== null ? { logger: this.logger } : {}),
    });
    this.rooms.set(roomId, room);
    return room;
  }

  delete(roomId: string): void {
    this.rooms.delete(roomId);
  }

  /**
   * Call `room.tick()` on every registered room and fire the AI fallback
   * for any newly-AFK seat. Public so tests can drive ticks manually.
   */
  async tickAll(now?: number): Promise<void> {
    for (const room of this.rooms.values()) {
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
  }
}

// Singleton for production use. Tests build their own.
export const registry = new RoomRegistry({ autoTick: true });
