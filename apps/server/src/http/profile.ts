/**
 * Profile REST routes.
 *
 *   GET /api/profile/me — the caller's profile (display_name, username) plus
 *                        the `email` claim off their verified JWT.
 *
 * Display-name resolution is centralized here so the client doesn't need
 * direct PostgREST access to `profiles`. The lobby's seat-row rendering pulls
 * display names via `GET /api/rooms/:id`; this endpoint exists for
 * client-side auth store population ("who am I, what should my label say?").
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { Hono } from 'hono';
import { verifySupabaseJwt } from '../auth/verify';
import { anonClient } from '../supabase';

type AnyClient = SupabaseClient;

const profileRouter = new Hono();

function bearer(authHeader: string | null | undefined): string | null {
  if (!authHeader) return null;
  const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();
  return jwt || null;
}

function errBody(code: string, detail?: string) {
  return detail !== undefined ? { ok: false, code, detail } : { ok: false, code };
}

// ---------------------------------------------------------------------------
// GET /api/profile/me
// ---------------------------------------------------------------------------
profileRouter.get('/me', async (c) => {
  const authHeader = c.req.header('Authorization') ?? null;
  const user = await verifySupabaseJwt(authHeader);
  if (!user) return c.json(errBody('UNAUTHORIZED'), 401);

  const jwt = bearer(authHeader);
  if (!jwt) return c.json(errBody('UNAUTHORIZED'), 401);

  // RLS on `profiles` already restricts reads to the caller's row; the anon
  // client with the user's JWT is sufficient.
  const client = anonClient(jwt) as unknown as AnyClient;
  const { data, error } = await client
    .from('profiles')
    .select('display_name, username')
    .eq('id', user.id)
    .maybeSingle();
  if (error) return c.json(errBody('FETCH_FAILED', error.message), 500);

  const row = (data ?? null) as { display_name: string | null; username: string | null } | null;

  return c.json(
    {
      ok: true,
      data: {
        displayName: row?.display_name ?? null,
        username: row?.username ?? null,
        email: user.email ?? null,
      },
    },
    200,
  );
});

export { profileRouter };
