/**
 * Edge function: load-save
 *
 * GET ?code=XXXXXXXX
 *
 * Returns the saved state, incrementing load_count and setting last_loaded_at.
 * Returns 404 if the code does not exist.
 * Returns 410 if the save has expired (expires_at < now()).
 *
 * Response: { ok: true, code: string, state: GameStateBlob, schemaVersion: number }
 *         | { ok: false, code: "SAVE_NOT_FOUND" | "SAVE_EXPIRED", detail?: string }
 */

import { createClient } from 'npm:@supabase/supabase-js@2';

const SAVE_CODE_RE = /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$/;

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'GET') {
    return json({ ok: false, code: 'METHOD_NOT_ALLOWED' }, 405);
  }

  const url = new URL(req.url);
  const rawCode = (url.searchParams.get('code') ?? '').toUpperCase().replace(/[\s-]/g, '');

  if (!SAVE_CODE_RE.test(rawCode)) {
    return json({ ok: false, code: 'INVALID_CODE', detail: 'code must be 8 chars from the save alphabet' }, 400);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const client = createClient(supabaseUrl, serviceKey);

  const { data, error } = await client
    .from('saves')
    .select('code, state_json, schema_version, expires_at')
    .eq('code', rawCode)
    .maybeSingle();

  if (error) {
    console.error('load-save select error', error);
    return json({ ok: false, code: 'INTERNAL_ERROR', detail: error.message }, 500);
  }

  if (!data) {
    return json({ ok: false, code: 'SAVE_NOT_FOUND' }, 404);
  }

  // Check expiry
  if (data.expires_at !== null && new Date(data.expires_at) < new Date()) {
    return json({ ok: false, code: 'SAVE_EXPIRED' }, 410);
  }

  // Fire-and-forget load stats update (non-critical)
  client
    .from('saves')
    .update({ last_loaded_at: new Date().toISOString(), load_count: (data as { load_count?: number }).load_count ?? 0 + 1 })
    .eq('code', rawCode)
    .then(() => {/* ignore */});

  return json({
    ok: true,
    code: data.code,
    state: data.state_json,
    schemaVersion: data.schema_version,
  });
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
