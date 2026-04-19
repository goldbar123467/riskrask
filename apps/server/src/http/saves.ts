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

import { parseSaveCode } from '@riskrask/shared';
import { Hono } from 'hono';
import { z } from 'zod';
import { verifySupabaseJwt } from '../auth/verify';
import { SaveExpiredError, createSave, deleteSave, loadSave } from '../persistence/saves';
import { serviceClient } from '../supabase';

const savesRouter = new Hono();

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------
const CreateSaveBody = z.object({
  state: z.object({ schemaVersion: z.number().int().min(1) }).passthrough(),
  ownerId: z.string().uuid().optional(),
});

// ---------------------------------------------------------------------------
// POST /api/saves
// Calls the create_save_with_expiry Postgres RPC directly via the service
// client — no edge-function hop. Owner-linked saves require the caller's
// Supabase JWT in Authorization; anonymous saves get a 30-day TTL.
// ---------------------------------------------------------------------------
savesRouter.post('/', async (c) => {
  let body: z.infer<typeof CreateSaveBody>;
  try {
    body = CreateSaveBody.parse(await c.req.json());
  } catch {
    return c.json({ ok: false, code: 'INVALID_REQUEST', detail: 'invalid body shape' }, 400);
  }

  // Optional Turnstile gate (TODO: enable via TURNSTILE_REQUIRED=1 env)
  // const turnstileRequired = process.env.TURNSTILE_REQUIRED === '1';
  // if (turnstileRequired && !body.ownerId) { ... }

  // Owner check: if Authorization is present, the JWT user must match ownerId.
  let resolvedOwnerId: string | null = body.ownerId ?? null;
  const authHeader = c.req.header('Authorization');
  if (authHeader) {
    const user = await verifySupabaseJwt(authHeader);
    if (!user) {
      return c.json({ ok: false, code: 'UNAUTHORIZED', detail: 'invalid token' }, 401);
    }
    if (body.ownerId && body.ownerId !== user.id) {
      return c.json({ ok: false, code: 'FORBIDDEN', detail: 'ownerId mismatch' }, 403);
    }
    resolvedOwnerId = user.id;
  }

  const stateJson = body.state as Record<string, unknown>;
  const schemaVersion = stateJson.schemaVersion as number;

  try {
    const result = await createSave(serviceClient(), {
      stateJson,
      schemaVersion,
      ...(resolvedOwnerId ? { ownerId: resolvedOwnerId } : {}),
    });
    return c.json({ ok: true, code: result.code, expiresAt: result.expiresAt }, 200);
  } catch (e) {
    const detail = e instanceof Error ? e.message : 'unknown';
    return c.json({ ok: false, code: 'CREATE_FAILED', detail }, 500);
  }
});

// ---------------------------------------------------------------------------
// GET /api/saves/:code
// ---------------------------------------------------------------------------
savesRouter.get('/:code', async (c) => {
  const raw = c.req.param('code');
  const code = parseSaveCode(raw);
  if (!code) {
    return c.json(
      { ok: false, code: 'INVALID_CODE', detail: 'code must be 8 chars from the save alphabet' },
      400,
    );
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
