/**
 * Save-code REST endpoints.
 *
 * POST   /api/saves            — create a new save; returns { ok, code, expiresAt }
 * GET    /api/saves/:code      — load a save; returns { ok, code, state, schemaVersion }
 * POST   /api/saves/:code/delete — owner-only delete
 *
 * Calls the Supabase edge functions for create/load; uses the persistence
 * layer directly for owner deletes.
 *
 * TURNSTILE_REQUIRED feature flag: when set to "1" (default off for now),
 * anonymous POSTs must include a valid Cloudflare Turnstile token in the
 * `X-Turnstile-Token` header.  Verification is a no-op until Track F lands.
 * TODO(track-f): wire in real Turnstile verification.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { parseSaveCode } from '@riskrask/shared';
import { verifySupabaseJwt } from '../auth/verify';
import { deleteSave, SaveExpiredError, loadSave } from '../persistence/saves';
import { serviceClient, edgeFunctionUrl } from '../supabase';

const savesRouter = new Hono();

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------
const CreateSaveBody = z.object({
  state: z
    .object({ schemaVersion: z.number().int().min(1) })
    .passthrough(),
  schemaVersion: z.number().int().min(1),
  ownerId: z.string().uuid().optional(),
});

// ---------------------------------------------------------------------------
// POST /api/saves
// ---------------------------------------------------------------------------
savesRouter.post('/', async (c) => {
  let body: z.infer<typeof CreateSaveBody>;
  try {
    body = CreateSaveBody.parse(await c.req.json());
  } catch {
    return c.json({ ok: false, code: 'INVALID_REQUEST', detail: 'invalid body shape' }, 400);
  }

  // Optional Turnstile gate (TODO: enable via TURNSTILE_REQUIRED=1 env)
  const turnstileRequired = process.env['TURNSTILE_REQUIRED'] === '1';
  if (turnstileRequired && !body.ownerId) {
    // TODO(track-f): verify X-Turnstile-Token header
    // const token = c.req.header('X-Turnstile-Token');
  }

  const authHeader = c.req.header('Authorization') ?? null;

  // Forward to edge function
  const res = await fetch(edgeFunctionUrl('create-save'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(authHeader ? { Authorization: authHeader } : {}),
    },
    body: JSON.stringify(body),
  });

  const data = (await res.json()) as unknown;
  return c.json(data, res.status as 200 | 400 | 401 | 403 | 500);
});

// ---------------------------------------------------------------------------
// GET /api/saves/:code
// ---------------------------------------------------------------------------
savesRouter.get('/:code', async (c) => {
  const raw = c.req.param('code');
  const code = parseSaveCode(raw);
  if (!code) {
    return c.json({ ok: false, code: 'INVALID_CODE', detail: 'code must be 8 chars from the save alphabet' }, 400);
  }

  const client = serviceClient();
  try {
    const result = await loadSave(client, code);
    if (!result) {
      return c.json({ ok: false, code: 'SAVE_NOT_FOUND' }, 404);
    }
    return c.json({
      ok: true,
      code,
      state: result.state,
      schemaVersion: result.schemaVersion,
    });
  } catch (err) {
    if (err instanceof SaveExpiredError) {
      return c.json({ ok: false, code: 'SAVE_EXPIRED' }, 410);
    }
    const detail = err instanceof Error ? err.message : 'unknown error';
    return c.json({ ok: false, code: 'INTERNAL_ERROR', detail }, 500);
  }
});

// ---------------------------------------------------------------------------
// POST /api/saves/:code/delete  (owner-only)
// ---------------------------------------------------------------------------
savesRouter.post('/:code/delete', async (c) => {
  const raw = c.req.param('code');
  const code = parseSaveCode(raw);
  if (!code) {
    return c.json({ ok: false, code: 'INVALID_CODE' }, 400);
  }

  const user = await verifySupabaseJwt(c.req.header('Authorization') ?? null);
  if (!user) {
    return c.json({ ok: false, code: 'UNAUTHORIZED' }, 401);
  }

  const client = serviceClient();
  try {
    const deleted = await deleteSave(client, code, user.id);
    if (!deleted) {
      return c.json({ ok: false, code: 'SAVE_NOT_FOUND' }, 404);
    }
    return c.json({ ok: true });
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'unknown error';
    return c.json({ ok: false, code: 'INTERNAL_ERROR', detail }, 500);
  }
});

export { savesRouter };
