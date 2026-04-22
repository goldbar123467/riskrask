/**
 * Multiplayer wire protocol.
 *
 * Zod discriminated unions for every message flowing over the room
 * WebSocket. Engine `Action` / `Effect` shapes are deep structural
 * unions; we keep them as `unknown` at the zod boundary and let the
 * engine reducer validate on apply. Everything else is fully typed.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

/** Room id (UUID string). Kept as a bare string for DB round-tripping. */
export type RoomId = string;

/** Seat index within a room, 0-based. */
export type SeatIdx = number;

const RoomIdSchema = z.string().min(1);
const SeatIdxSchema = z.number().int().min(0).max(5);
const HashSchema = z.string().min(1);
const SeqSchema = z.number().int().min(0);

// ---------------------------------------------------------------------------
// Client → Server
// ---------------------------------------------------------------------------

export const ClientJoinSchema = z.object({
  type: z.literal('join'),
  roomId: RoomIdSchema,
  seatIdx: SeatIdxSchema,
  lastSeq: SeqSchema.optional(),
});

export const ClientIntentSchema = z.object({
  type: z.literal('intent'),
  /** Engine `Action`. Validated by the reducer on apply. */
  action: z.unknown(),
  clientHash: HashSchema.optional(),
});

export const ClientChatSchema = z.object({
  type: z.literal('chat'),
  text: z.string().min(1).max(512),
});

export const ClientHeartbeatSchema = z.object({
  type: z.literal('heartbeat'),
  ts: z.number().int(),
});

export const ClientMsgSchema = z.discriminatedUnion('type', [
  ClientJoinSchema,
  ClientIntentSchema,
  ClientChatSchema,
  ClientHeartbeatSchema,
]);

export type ClientMsg = z.infer<typeof ClientMsgSchema>;

// ---------------------------------------------------------------------------
// Server → Client
// ---------------------------------------------------------------------------

/** One seat as reported to clients on welcome. */
export const SeatInfoSchema = z.object({
  seatIdx: SeatIdxSchema,
  userId: z.string().nullable(),
  isAi: z.boolean(),
  archId: z.string().nullable(),
  connected: z.boolean(),
});
export type SeatInfo = z.infer<typeof SeatInfoSchema>;

export const ServerWelcomeSchema = z.object({
  type: z.literal('welcome'),
  gameId: z.string().min(1),
  seatIdx: SeatIdxSchema,
  /** Engine `GameState`. Opaque here; client re-asserts via engine types. */
  state: z.unknown(),
  seats: z.array(SeatInfoSchema),
  hash: HashSchema,
  seq: SeqSchema,
  /**
   * Absolute epoch-ms at which the current seat's turn budget expires.
   * Optional because rooms that haven't launched yet (setup-claim without
   * TurnDriver) won't emit it, and reconnects that arrive between turns or
   * after the game ended won't either. Clients that see it start a
   * countdown.
   */
  turnDeadlineMs: z.number().int().optional(),
});

export const ServerAppliedSchema = z.object({
  type: z.literal('applied'),
  seq: SeqSchema,
  /** Echo of the Action that produced this effect set. */
  action: z.unknown(),
  nextHash: HashSchema,
  /** Engine `Effect[]`. Opaque on the wire. */
  effects: z.unknown(),
});

export const ServerAiTakeoverSchema = z.object({
  type: z.literal('ai-takeover'),
  seatIdx: SeatIdxSchema,
});

export const ServerChatSchema = z.object({
  type: z.literal('chat'),
  userId: z.string(),
  text: z.string(),
  ts: z.number().int(),
});

export const ServerPresenceSchema = z.object({
  type: z.literal('presence'),
  seatIdx: SeatIdxSchema,
  connected: z.boolean(),
});

export const ServerDesyncSchema = z.object({
  type: z.literal('desync'),
  reason: z.string(),
});

export const ServerErrorSchema = z.object({
  type: z.literal('error'),
  code: z.string(),
  detail: z.string().optional(),
});

/**
 * Fired whenever the server changes the active seat (`state.currentPlayerIdx`).
 * Clients use it to restart their per-turn countdown and optionally
 * re-surface whose turn it is. `turnNumber` matches `GameState.turn`
 * post-advance.
 */
export const ServerTurnAdvanceSchema = z.object({
  type: z.literal('turn_advance'),
  currentSeatIdx: SeatIdxSchema,
  turnNumber: z.number().int().min(0),
  deadlineMs: z.number().int(),
});

/**
 * Terminal frame emitted exactly once when the engine sets `state.winner`.
 * The server closes sockets ~500ms after broadcasting. `winnerUserId` is
 * null for AI winners; `winnerSeatIdx` is null only if the winner cannot be
 * resolved back to a seat (defensive — shouldn't happen in practice).
 */
export const ServerGameOverSchema = z.object({
  type: z.literal('game_over'),
  winnerPlayerId: z.string().min(1),
  winnerSeatIdx: SeatIdxSchema.nullable(),
  winnerUserId: z.string().nullable(),
  winnerDisplay: z.string().min(1),
  finalHash: HashSchema,
  finalSeq: SeqSchema,
});

export const ServerMsgSchema = z.discriminatedUnion('type', [
  ServerWelcomeSchema,
  ServerAppliedSchema,
  ServerAiTakeoverSchema,
  ServerChatSchema,
  ServerPresenceSchema,
  ServerDesyncSchema,
  ServerErrorSchema,
  ServerTurnAdvanceSchema,
  ServerGameOverSchema,
]);

export type ServerMsg = z.infer<typeof ServerMsgSchema>;
