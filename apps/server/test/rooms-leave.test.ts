/**
 * POST /api/rooms/:id/leave — verify the handler surfaces the new
 * `{ roomDeleted, newHostId }` fields from the updated `leave_room` RPC
 * (migration 0020).
 *
 * The RPC itself is exercised end-to-end in a Postgres smoke test (see
 * `supabase/migrations/tests/0020_leave_room_cleanup.sql`). This test stubs
 * the supabase-js client response and asserts the Hono route extracts the
 * correct fields.
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
  verifySupabaseJwt: async (authHeader: string | null) => {
    if (!authHeader) return null;
    const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (jwt === 'alice') return { id: 'user-alice', email: 'alice@example.test' };
    return null;
  },
  verifyAdminJwt: async () => null,
  __resetJwksCache: () => {},
}));

await mock.module('../src/supabase', () => ({
  serviceClient: (): SupabaseLike => mockSupabase.client,
  anonClient: (_jwt?: string): SupabaseLike => mockSupabase.client,
  edgeFunctionUrl: (name: string) => `http://stub.local/functions/v1/${name}`,
}));

const { app } = await import('../src/index');

describe('POST /api/rooms/:id/leave — new response surface', () => {
  test('room deleted → roomDeleted=true, newHostId=null', async () => {
    mockSupabase.setRpcResponse('leave_room', {
      data: [{ room_deleted: true, new_host_id: null }],
      error: null,
    });
    const res = await app.fetch(
      new Request('http://localhost/api/rooms/r1/leave', {
        method: 'POST',
        headers: { Authorization: 'Bearer alice' },
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      data: { roomDeleted: boolean; newHostId: string | null };
    };
    expect(body.ok).toBe(true);
    expect(body.data.roomDeleted).toBe(true);
    expect(body.data.newHostId).toBeNull();
  });

  test('host transferred → roomDeleted=false, newHostId populated', async () => {
    mockSupabase.setRpcResponse('leave_room', {
      data: [{ room_deleted: false, new_host_id: 'user-bob' }],
      error: null,
    });
    const res = await app.fetch(
      new Request('http://localhost/api/rooms/r2/leave', {
        method: 'POST',
        headers: { Authorization: 'Bearer alice' },
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      data: { roomDeleted: boolean; newHostId: string | null };
    };
    expect(body.data.roomDeleted).toBe(false);
    expect(body.data.newHostId).toBe('user-bob');
  });

  test('unremarkable leave → both fields falsy', async () => {
    mockSupabase.setRpcResponse('leave_room', {
      data: [{ room_deleted: false, new_host_id: null }],
      error: null,
    });
    const res = await app.fetch(
      new Request('http://localhost/api/rooms/r3/leave', {
        method: 'POST',
        headers: { Authorization: 'Bearer alice' },
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      data: { roomDeleted: boolean; newHostId: string | null };
    };
    expect(body.data.roomDeleted).toBe(false);
    expect(body.data.newHostId).toBeNull();
  });

  test('RPC returns empty array → defensive defaults', async () => {
    mockSupabase.setRpcResponse('leave_room', { data: [], error: null });
    const res = await app.fetch(
      new Request('http://localhost/api/rooms/r4/leave', {
        method: 'POST',
        headers: { Authorization: 'Bearer alice' },
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      data: { roomDeleted: boolean; newHostId: string | null };
    };
    expect(body.data.roomDeleted).toBe(false);
    expect(body.data.newHostId).toBeNull();
  });

  test('RPC error surfaces as LEAVE_FAILED 400', async () => {
    mockSupabase.setRpcResponse('leave_room', {
      data: null,
      error: { message: 'room not found' },
    });
    const res = await app.fetch(
      new Request('http://localhost/api/rooms/r5/leave', {
        method: 'POST',
        headers: { Authorization: 'Bearer alice' },
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean; code: string };
    expect(body.code).toBe('LEAVE_FAILED');
  });
});
