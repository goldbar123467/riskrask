/**
 * Unit coverage for `fillEmptySeats`.
 *
 * We mock both the service-role client (for the `room_seats` read) and
 * the JWT-scoped anon client (for the `add_ai_seat` RPC). The test
 * asserts:
 *   - N gaps → N RPC calls, one per gap
 *   - every archetype passed matches the 9-ID canonical set
 *   - occupied seats are skipped
 *   - an RPC error halts the loop and surfaces AUTOFILL_FAILED
 */

import { beforeAll, describe, expect, test } from 'bun:test';

beforeAll(() => {
  process.env.SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://stub.local';
  process.env.SUPABASE_SERVICE_ROLE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'service-stub-key';
  process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? 'anon-stub-key';
});

import { ARCH_IDS } from '@riskrask/ai';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fillEmptySeats } from '../src/rooms/autofill';

const ROOM_ID = 'room-id-xyz';

// ---------------------------------------------------------------------------
// Stub builders
// ---------------------------------------------------------------------------

interface SeatRow {
  seat_idx: number;
}

function svcStub(existing: SeatRow[], opts: { selectError?: string } = {}): SupabaseClient {
  return {
    from: (_t: string) => ({
      select: (_cols: string) => ({
        eq: (_c: string, _v: unknown) => ({
          is: async (_c2: string, _v2: unknown) => {
            if (opts.selectError) return { data: null, error: { message: opts.selectError } };
            return { data: existing, error: null };
          },
        }),
      }),
    }),
  } as unknown as SupabaseClient;
}

interface RpcCall {
  fn: string;
  args: { p_room_id: string; p_arch_id: string };
}

function anonStub(behaviour: 'ok' | { failAtIdx: number; err: string }): {
  client: SupabaseClient;
  calls: RpcCall[];
} {
  const calls: RpcCall[] = [];
  const client = {
    rpc: async (fn: string, args: { p_room_id: string; p_arch_id: string }) => {
      calls.push({ fn, args });
      if (behaviour !== 'ok' && calls.length - 1 === behaviour.failAtIdx) {
        return { data: null, error: { message: behaviour.err } };
      }
      return { data: null, error: null };
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

// Deterministic rng: round-robins through ARCH_IDS.
function seqRng(): () => number {
  let i = 0;
  return () => {
    const v = (i % ARCH_IDS.length) / ARCH_IDS.length;
    i++;
    return v;
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('fillEmptySeats', () => {
  test('fills every gap when the room has one host seat', async () => {
    const svc = svcStub([{ seat_idx: 0 }]);
    const anon = anonStub('ok');
    const result = await fillEmptySeats(svc, 'host-jwt', ROOM_ID, 6, {
      rng: seqRng(),
      makeAnonClient: () => anon.client,
    });
    expect(result.filled).toBe(5);
    expect(anon.calls).toHaveLength(5);
    for (const call of anon.calls) {
      expect(call.fn).toBe('add_ai_seat');
      expect(call.args.p_room_id).toBe(ROOM_ID);
      expect(ARCH_IDS.includes(call.args.p_arch_id as (typeof ARCH_IDS)[number])).toBe(true);
    }
  });

  test('skips occupied seats — room with 3 players + 3 gaps = 3 RPCs', async () => {
    const svc = svcStub([{ seat_idx: 0 }, { seat_idx: 2 }, { seat_idx: 4 }]);
    const anon = anonStub('ok');
    const result = await fillEmptySeats(svc, 'host-jwt', ROOM_ID, 6, {
      rng: seqRng(),
      makeAnonClient: () => anon.client,
    });
    expect(result.filled).toBe(3);
    expect(anon.calls).toHaveLength(3);
  });

  test('returns 0 when every seat is already filled', async () => {
    const svc = svcStub([
      { seat_idx: 0 },
      { seat_idx: 1 },
      { seat_idx: 2 },
      { seat_idx: 3 },
      { seat_idx: 4 },
      { seat_idx: 5 },
    ]);
    const anon = anonStub('ok');
    const result = await fillEmptySeats(svc, 'host-jwt', ROOM_ID, 6, {
      rng: seqRng(),
      makeAnonClient: () => anon.client,
    });
    expect(result.filled).toBe(0);
    expect(anon.calls).toHaveLength(0);
  });

  test('surfaces first RPC error as AUTOFILL_FAILED, stops further calls', async () => {
    const svc = svcStub([{ seat_idx: 0 }]);
    // gaps = [1,2,3,4,5]; fail on index 2 (the third call → seat_idx 3)
    const anon = anonStub({ failAtIdx: 2, err: 'room full' });
    await expect(
      fillEmptySeats(svc, 'host-jwt', ROOM_ID, 6, {
        rng: seqRng(),
        makeAnonClient: () => anon.client,
      }),
    ).rejects.toThrow(/AUTOFILL_FAILED: seat 3: room full/);
    expect(anon.calls).toHaveLength(3);
  });

  test('surfaces select errors as AUTOFILL_FAILED', async () => {
    const svc = svcStub([], { selectError: 'permission denied' });
    const anon = anonStub('ok');
    await expect(
      fillEmptySeats(svc, 'host-jwt', ROOM_ID, 6, {
        rng: seqRng(),
        makeAnonClient: () => anon.client,
      }),
    ).rejects.toThrow(/AUTOFILL_FAILED: could not read room_seats: permission denied/);
    expect(anon.calls).toHaveLength(0);
  });

  test('varying maxPlayers caps the fill count', async () => {
    const svc = svcStub([{ seat_idx: 0 }]);
    const anon = anonStub('ok');
    const result = await fillEmptySeats(svc, 'host-jwt', ROOM_ID, 4, {
      rng: seqRng(),
      makeAnonClient: () => anon.client,
    });
    expect(result.filled).toBe(3);
    expect(anon.calls).toHaveLength(3);
  });

  test('anon client factory is called exactly once with the host jwt', async () => {
    const svc = svcStub([{ seat_idx: 0 }]);
    const anon = anonStub('ok');
    let factoryCalls = 0;
    const seenJwts: string[] = [];
    await fillEmptySeats(svc, 'a-jwt', ROOM_ID, 3, {
      rng: seqRng(),
      makeAnonClient: (jwt) => {
        factoryCalls++;
        seenJwts.push(jwt);
        return anon.client;
      },
    });
    expect(factoryCalls).toBe(1);
    expect(seenJwts).toEqual(['a-jwt']);
  });
});
