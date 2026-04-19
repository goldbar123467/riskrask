/**
 * Health + readiness endpoints.
 *
 * GET /health  — always 200; returns version info.
 * GET /ready   — 200 after first successful Supabase ping; 503 otherwise.
 */

import type { Context } from 'hono';
import { Hono } from 'hono';
import { serviceClient } from '../supabase';

const healthRouter = new Hono();

// Cached readiness state — avoids repeated DB pings after first success.
let ready = false;

healthRouter.get('/health', (c: Context) =>
  c.json({
    ok: true,
    service: 'riskrask-server',
    version: process.env.GIT_SHA ?? 'dev',
  }),
);

healthRouter.get('/ready', async (c: Context) => {
  if (ready) {
    return c.json({ ok: true });
  }

  try {
    // Lightweight Supabase ping: query a system table.
    const client = serviceClient();
    const { error } = await client.from('profiles').select('id').limit(1);
    if (!error) {
      ready = true;
      return c.json({ ok: true });
    }
    return c.json({ ok: false, detail: error.message }, 503);
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'unknown error';
    return c.json({ ok: false, detail }, 503);
  }
});

export { healthRouter };
