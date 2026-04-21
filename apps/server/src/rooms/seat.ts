/**
 * Seat shape tracked by the in-memory Room.
 *
 * Mirrors the DB row in `room_seats` but only the fields the server
 * needs at runtime. User-visible subset is serialised via
 * `SeatInfoSchema` from @riskrask/shared/protocol.
 */

export interface Seat {
  readonly seatIdx: number;
  /** null when the seat is AI-controlled or vacant. */
  userId: string | null;
  isAi: boolean;
  /** AI archetype id; null for human seats. */
  archId: string | null;
  connected: boolean;
  /** Marks a seat as AFK → eligible for AI takeover on its turn. */
  afk: boolean;
}
