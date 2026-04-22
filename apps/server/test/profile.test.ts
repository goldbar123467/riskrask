/**
 * GET /api/profile/me — display-name + username + email surface.
 *
 * The profile route pulls `display_name` / `username` from the profiles
 * table using the caller's anon-scoped Supabase client and reads `email`
 * from the verified JWT. This test stubs both layers so the route runs
 * end-to-end without a live Supabase.
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

// Import after mocks are installed.
const { app } = await import('../src/index');

describe('GET /api/profile/me', () => {
  test('missing Authorization → 401', async () => {
    const res = await app.fetch(new Request('http://localhost/api/profile/me'));
    expect(res.status).toBe(401);
    const body = (await res.json()) as { ok: boolean; code: string };
    expect(body.ok).toBe(false);
    expect(body.code).toBe('UNAUTHORIZED');
  });

  test('bogus JWT (no known user) → 401', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/profile/me', {
        headers: { Authorization: 'Bearer not.a.real.jwt' },
      }),
    );
    expect(res.status).toBe(401);
  });

  test('authenticated → 200 with displayName / username / email', async () => {
    mockSupabase.setTable('profiles', [
      { id: 'user-alice', display_name: 'Alice the Great', username: 'alice' },
    ]);
    const res = await app.fetch(
      new Request('http://localhost/api/profile/me', {
        headers: { Authorization: 'Bearer alice' },
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      data: { displayName: string | null; username: string | null; email: string | null };
    };
    expect(body.ok).toBe(true);
    expect(body.data.displayName).toBe('Alice the Great');
    expect(body.data.username).toBe('alice');
    expect(body.data.email).toBe('alice@example.test');
  });

  test('missing profile row → null fields, email still surfaces', async () => {
    mockSupabase.setTable('profiles', []);
    const res = await app.fetch(
      new Request('http://localhost/api/profile/me', {
        headers: { Authorization: 'Bearer alice' },
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      data: { displayName: string | null; username: string | null; email: string | null };
    };
    expect(body.data.displayName).toBeNull();
    expect(body.data.username).toBeNull();
    expect(body.data.email).toBe('alice@example.test');
  });
});
