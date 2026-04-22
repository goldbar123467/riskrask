import { describe, expect, test } from 'bun:test';
import { ClientMsgSchema, ServerMsgSchema } from '../src/protocol';

describe('protocol zod schemas', () => {
  // -----------------------------------------------------------------------
  // Client messages
  // -----------------------------------------------------------------------
  test('round-trips client join', () => {
    const m = { type: 'join', roomId: 'room-abc', seatIdx: 2 } as const;
    expect(() => ClientMsgSchema.parse(m)).not.toThrow();
    const m2 = { type: 'join', roomId: 'room-abc', seatIdx: 0, lastSeq: 12 } as const;
    expect(() => ClientMsgSchema.parse(m2)).not.toThrow();
  });

  test('round-trips client intent (action opaque)', () => {
    const m = {
      type: 'intent',
      action: { type: 'end-turn' },
      clientHash: 'abc123',
    } as const;
    expect(() => ClientMsgSchema.parse(m)).not.toThrow();
  });

  test('round-trips client chat', () => {
    const m = { type: 'chat', text: 'hi' } as const;
    expect(() => ClientMsgSchema.parse(m)).not.toThrow();
  });

  test('round-trips client heartbeat', () => {
    const m = { type: 'heartbeat', ts: 1_700_000_000_000 } as const;
    expect(() => ClientMsgSchema.parse(m)).not.toThrow();
  });

  test('rejects malformed client message (missing type)', () => {
    expect(() => ClientMsgSchema.parse({ roomId: 'r', seatIdx: 0 })).toThrow();
  });

  test('rejects malformed client message (unknown type)', () => {
    expect(() => ClientMsgSchema.parse({ type: 'nope' })).toThrow();
  });

  test('rejects client chat with empty text', () => {
    expect(() => ClientMsgSchema.parse({ type: 'chat', text: '' })).toThrow();
  });

  test('rejects negative seat idx', () => {
    expect(() => ClientMsgSchema.parse({ type: 'join', roomId: 'r', seatIdx: -1 })).toThrow();
  });

  // -----------------------------------------------------------------------
  // Server messages
  // -----------------------------------------------------------------------
  test('round-trips server welcome', () => {
    const m = {
      type: 'welcome',
      gameId: 'g1',
      seatIdx: 0,
      state: { schemaVersion: 1, phase: 'reinforce' },
      seats: [
        { seatIdx: 0, userId: 'u1', isAi: false, archId: null, connected: true },
        { seatIdx: 1, userId: null, isAi: true, archId: 'zhukov', connected: true },
      ],
      hash: 'deadbeef',
      seq: 0,
    } as const;
    expect(() => ServerMsgSchema.parse(m)).not.toThrow();
  });

  test('round-trips server applied', () => {
    const m = {
      type: 'applied',
      seq: 7,
      action: { type: 'reinforce', territory: 'Brazil', count: 3 },
      nextHash: 'cafef00d',
      effects: [{ kind: 'log', text: 'Brazil reinforced' }],
    } as const;
    expect(() => ServerMsgSchema.parse(m)).not.toThrow();
  });

  test('round-trips ai-takeover', () => {
    expect(() => ServerMsgSchema.parse({ type: 'ai-takeover', seatIdx: 3 })).not.toThrow();
  });

  test('round-trips server chat', () => {
    expect(() =>
      ServerMsgSchema.parse({ type: 'chat', userId: 'u1', text: 'gg', ts: 123 }),
    ).not.toThrow();
  });

  test('round-trips presence', () => {
    expect(() =>
      ServerMsgSchema.parse({ type: 'presence', seatIdx: 1, connected: false }),
    ).not.toThrow();
  });

  test('round-trips desync', () => {
    expect(() => ServerMsgSchema.parse({ type: 'desync', reason: 'hash-mismatch' })).not.toThrow();
  });

  test('round-trips error', () => {
    expect(() =>
      ServerMsgSchema.parse({ type: 'error', code: 'NOT_YOUR_TURN', detail: 'seat 2 active' }),
    ).not.toThrow();
    expect(() => ServerMsgSchema.parse({ type: 'error', code: 'X' })).not.toThrow();
  });

  test('rejects malformed server message (missing fields)', () => {
    expect(() => ServerMsgSchema.parse({ type: 'welcome' })).toThrow();
  });

  test('rejects server message with unknown type', () => {
    expect(() => ServerMsgSchema.parse({ type: 'bogus' })).toThrow();
  });

  // -----------------------------------------------------------------------
  // New frames — turn_advance + game_over
  // -----------------------------------------------------------------------
  test('round-trips server welcome with turnDeadlineMs', () => {
    const m = {
      type: 'welcome',
      gameId: 'g1',
      seatIdx: 0,
      state: {},
      seats: [{ seatIdx: 0, userId: 'u1', isAi: false, archId: null, connected: true }],
      hash: 'deadbeef',
      seq: 0,
      turnDeadlineMs: 1_700_000_030_000,
    } as const;
    expect(() => ServerMsgSchema.parse(m)).not.toThrow();
  });

  test('round-trips turn_advance', () => {
    const m = {
      type: 'turn_advance',
      currentSeatIdx: 2,
      turnNumber: 7,
      deadlineMs: 1_700_000_030_000,
    } as const;
    expect(() => ServerMsgSchema.parse(m)).not.toThrow();
  });

  test('rejects turn_advance with non-int turnNumber', () => {
    const m = {
      type: 'turn_advance',
      currentSeatIdx: 2,
      turnNumber: 7.5,
      deadlineMs: 1_700_000_030_000,
    };
    expect(() => ServerMsgSchema.parse(m)).toThrow();
  });

  test('rejects turn_advance with out-of-range seat', () => {
    const m = {
      type: 'turn_advance',
      currentSeatIdx: 9,
      turnNumber: 1,
      deadlineMs: 1,
    };
    expect(() => ServerMsgSchema.parse(m)).toThrow();
  });

  test('round-trips game_over (human winner)', () => {
    const m = {
      type: 'game_over',
      winnerPlayerId: 'user-alice',
      winnerSeatIdx: 0,
      winnerUserId: 'user-alice',
      winnerDisplay: 'Alice',
      finalHash: 'f1nalhash',
      finalSeq: 142,
    } as const;
    expect(() => ServerMsgSchema.parse(m)).not.toThrow();
  });

  test('round-trips game_over (AI winner — null user + null seat)', () => {
    const m = {
      type: 'game_over',
      winnerPlayerId: 'seat-3-ai',
      winnerSeatIdx: null,
      winnerUserId: null,
      winnerDisplay: 'Napoleon',
      finalHash: 'f1nalhash',
      finalSeq: 200,
    } as const;
    expect(() => ServerMsgSchema.parse(m)).not.toThrow();
  });

  test('rejects game_over with empty winnerDisplay', () => {
    const m = {
      type: 'game_over',
      winnerPlayerId: 'x',
      winnerSeatIdx: 0,
      winnerUserId: null,
      winnerDisplay: '',
      finalHash: 'h',
      finalSeq: 1,
    };
    expect(() => ServerMsgSchema.parse(m)).toThrow();
  });

  test('rejects game_over with missing finalHash', () => {
    const m = {
      type: 'game_over',
      winnerPlayerId: 'x',
      winnerSeatIdx: 0,
      winnerUserId: null,
      winnerDisplay: 'Napoleon',
      finalSeq: 1,
    };
    expect(() => ServerMsgSchema.parse(m)).toThrow();
  });
});
