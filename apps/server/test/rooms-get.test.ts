/**
 * GET /api/rooms/:id — seat enrichment.
 *
 * Focused on the new behaviour from migration 0020 / S4:
 *   - `data.room.seats` is present.
 *   - Each human seat resolves `displayName` through the profile join.
 *   - AI seats return `displayName: null`.
 *   - A human seat with no matching profile row falls back to null.
 *   - Seats are ordered by `seat_idx` ascending.
 *
 * The mock-supabase stub has no real filter/join semantics — tests seed the
 * table fixtures the route will see. The `profiles` fetch is driven by the
 * same fixture regardless of the IN(...) filter the route sends; we seed
 * only the rows we expect back.
 */

import { beforeAll, describe, expect, mock, test } from 'bun:test';

beforeAll(() => {
  process.env.SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://stub.local';
  process.env.SUPABASE_SERVICE_ROLE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'service-stub-key';
  process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? 'anon-stub-key';
});

import { type SupabaseLike, createMockSupabase } from './helpers/mock-supabase';

const mockSupabase = createMockSupabase();

await mock.module('../src/auth/verify', () => ({
  verifySupabaseJwt: async () => null,
  verifyAdminJwt: async () => null,
  __resetJwksCache: () => {},
}));

await mock.module('../src/supabase', () => ({
  serviceClient: (): SupabaseLike => mockSupabase.client,
  anonClient: (_jwt?: string): SupabaseLike => mockSupabase.client,
  edgeFunctionUrl: (name: string) => `http://stub.local/functions/v1/${name}`,
}));

const { app } = await import('../src/index');

interface SeatResponse {
  seatIdx: number;
  userId: string | null;
  isAi: boolean;
  archId: string | null;
  ready: boolean;
  connected: boolean;
  displayName: string | null;
}

describe('GET /api/rooms/:id — seat + display-name enrichment', () => {
  test('seat list is populated and ordered; displayName resolves via profile', async () => {
    const roomId = 'room-uuid';
    mockSupabase.setTable('rooms', [
      { id: roomId, code: 'ABCDEF', state: 'lobby', current_game_id: null },
    ]);
    mockSupabase.setTable('room_seats', [
      // Intentionally out of order to verify sorting.
      {
        seat_idx: 2,
        user_id: null,
        is_ai: true,
        arch_id: 'zhukov',
        is_ready: true,
        is_connected: false,
      },
      {
        seat_idx: 0,
        user_id: 'user-alice',
        is_ai: false,
        arch_id: null,
        is_ready: true,
        is_connected: true,
      },
      {
        seat_idx: 1,
        user_id: 'user-bob',
        is_ai: false,
        arch_id: null,
        is_ready: false,
        is_connected: true,
      },
      // Human seat with no matching profile row — should fall back to null.
      {
        seat_idx: 3,
        user_id: 'user-ghost',
        is_ai: false,
        arch_id: null,
        is_ready: false,
        is_connected: false,
      },
    ]);
    mockSupabase.setTable('profiles', [
      { id: 'user-alice', display_name: 'Alice the Great', username: 'alice' },
      // Bob has no display_name → fallback to username.
      { id: 'user-bob', display_name: null, username: 'bob' },
    ]);

    const res = await app.fetch(new Request(`http://localhost/api/rooms/${roomId}`));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      data: {
        room: {
          id: string;
          seats: SeatResponse[];
        };
        game: unknown | null;
      };
    };
    expect(body.ok).toBe(true);

    const seats = body.data.room.seats;
    expect(seats).toHaveLength(4);
    expect(seats.map((s) => s.seatIdx)).toEqual([0, 1, 2, 3]);

    // Seat 0 — Alice, display_name set.
    expect(seats[0]!.userId).toBe('user-alice');
    expect(seats[0]!.isAi).toBe(false);
    expect(seats[0]!.displayName).toBe('Alice the Great');
    expect(seats[0]!.ready).toBe(true);

    // Seat 1 — Bob, falls back to username.
    expect(seats[1]!.userId).toBe('user-bob');
    expect(seats[1]!.displayName).toBe('bob');

    // Seat 2 — AI seat.
    expect(seats[2]!.userId).toBeNull();
    expect(seats[2]!.isAi).toBe(true);
    expect(seats[2]!.archId).toBe('zhukov');
    expect(seats[2]!.displayName).toBeNull();

    // Seat 3 — human with no profile row.
    expect(seats[3]!.userId).toBe('user-ghost');
    expect(seats[3]!.displayName).toBeNull();
  });

  test('no seats → empty seats array, room returned, game null', async () => {
    const roomId = 'empty-room';
    mockSupabase.setTable('rooms', [
      { id: roomId, code: 'ZZZZZZ', state: 'lobby', current_game_id: null },
    ]);
    mockSupabase.setTable('room_seats', []);
    mockSupabase.setTable('profiles', []);

    const res = await app.fetch(new Request(`http://localhost/api/rooms/${roomId}`));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      data: { room: { seats: SeatResponse[] }; game: unknown | null };
    };
    expect(body.data.room.seats).toEqual([]);
    expect(body.data.game).toBeNull();
  });

  test('404 when the room row is absent', async () => {
    mockSupabase.setTable('rooms', []);
    const res = await app.fetch(new Request('http://localhost/api/rooms/missing'));
    expect(res.status).toBe(404);
  });
});
