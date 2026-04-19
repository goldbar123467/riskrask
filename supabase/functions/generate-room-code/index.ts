/**
 * Edge function: generate-room-code
 *
 * POST (no body required)
 *
 * Calls the Postgres generate_room_code() function and returns a fresh
 * 6-character room invite code.  This is a privileged operation — callers
 * must supply a valid user JWT; the Bun server calls this as part of the
 * room-creation flow.
 *
 * Response: { ok: true, code: string }
 *         | { ok: false, code: string, detail?: string }
 */

import { createClient } from 'npm:@supabase/supabase-js@2';

const ROOM_CODE_RE = /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/;

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') {
    return json({ ok: false, code: 'METHOD_NOT_ALLOWED' }, 405);
  }

  // Require a valid Supabase JWT
  const authHeader = req.headers.get('Authorization') ?? '';
  const jwt = authHeader.replace(/^Bearer\s+/i, '');
  if (!jwt) {
    return json({ ok: false, code: 'UNAUTHORIZED' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // Verify JWT
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

  // Generate code via Postgres function
  const serviceClient = createClient(supabaseUrl, serviceKey);
  const { data, error } = await serviceClient.rpc('generate_room_code');

  if (error || !data) {
    console.error('generate_room_code error', error);
    return json({ ok: false, code: 'INTERNAL_ERROR', detail: error?.message }, 500);
  }

  const code = data as string;
  if (!ROOM_CODE_RE.test(code)) {
    return json(
      { ok: false, code: 'INTERNAL_ERROR', detail: 'generated code failed validation' },
      500,
    );
  }

  return json({ ok: true, code });
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
