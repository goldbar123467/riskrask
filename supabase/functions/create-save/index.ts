/**
 * Edge function: create-save
 *
 * POST body: { state: GameStateBlob, schemaVersion: number, ownerId?: string }
 *
 * If ownerId is supplied the caller must also supply a valid Supabase JWT in
 * Authorization: Bearer <jwt>.  The JWT is verified against the Supabase ANON
 * key public JWKS; on success expires_at is set to NULL (permanent save).
 *
 * Anonymous requests (no ownerId / no JWT) get expires_at = now() + 30 days.
 *
 * The Postgres trigger auto-fills the save code; we return it in the response.
 *
 * Response: { ok: true, code: string, expiresAt: string | null }
 *         | { ok: false, code: string, detail?: string }
 */

import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3';

const SAVE_CODE_RE = /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$/;

const RequestBody = z.object({
  state: z.object({ schemaVersion: z.number().int().min(1) }).passthrough(),
  schemaVersion: z.number().int().min(1),
  ownerId: z.string().uuid().optional(),
});

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') {
    return json({ ok: false, code: 'METHOD_NOT_ALLOWED' }, 405);
  }

  let body: z.infer<typeof RequestBody>;
  try {
    body = RequestBody.parse(await req.json());
  } catch {
    return json({ ok: false, code: 'INVALID_REQUEST', detail: 'invalid body shape' }, 400);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // Verify JWT when ownerId is provided
  let verifiedOwnerId: string | null = null;
  if (body.ownerId) {
    const authHeader = req.headers.get('Authorization') ?? '';
    const jwt = authHeader.replace(/^Bearer\s+/i, '');
    if (!jwt) {
      return json({ ok: false, code: 'UNAUTHORIZED', detail: 'JWT required for owned saves' }, 401);
    }
    // Use anon client to verify JWT
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const anonClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const {
      data: { user },
      error: authError,
    } = await anonClient.auth.getUser();
    if (authError || !user) {
      return json({ ok: false, code: 'UNAUTHORIZED', detail: 'invalid JWT' }, 401);
    }
    if (user.id !== body.ownerId) {
      return json({ ok: false, code: 'FORBIDDEN', detail: 'ownerId must match JWT sub' }, 403);
    }
    verifiedOwnerId = user.id;
  }

  const client = createClient(supabaseUrl, serviceKey);

  // Insert row; trigger fills code; expires_at depends on ownership
  const insertRow: Record<string, unknown> = {
    state_json: body.state,
    schema_version: body.schemaVersion,
    owner_id: verifiedOwnerId ?? null,
    // expires_at omitted here; set via raw SQL expression below
  };

  // We need to set expires_at via a raw expression, so we use rpc or a raw query.
  // Supabase JS doesn't support interval literals in .insert(); use rpc wrapper.
  const { data, error } = await client.rpc('create_save_with_expiry', {
    p_state_json: body.state,
    p_schema_version: body.schemaVersion,
    p_owner_id: verifiedOwnerId ?? null,
  });

  if (error || !data) {
    console.error('create_save_with_expiry error', error);
    return json({ ok: false, code: 'INTERNAL_ERROR', detail: error?.message }, 500);
  }

  const row = data as { code: string; expires_at: string | null };
  if (!SAVE_CODE_RE.test(row.code)) {
    return json(
      { ok: false, code: 'INTERNAL_ERROR', detail: 'generated code failed validation' },
      500,
    );
  }

  return json({ ok: true, code: row.code, expiresAt: row.expires_at });
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
