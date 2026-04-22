import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { healthRouter } from './http/health';
import { profileRouter } from './http/profile';
import { roomsRouter } from './http/rooms';
import { savesRouter } from './http/saves';
import { handleGameOver } from './rooms/endGame';
import { registry } from './rooms/registry';
import { serviceClient } from './supabase';
import { websocket, wsRouter } from './ws';

/**
 * The Hono app is exported named so integration tests can mount it under
 * `Bun.serve({ fetch: app.fetch, websocket })` on a random port — the default
 * export carries the Bun.serve config and cannot be remounted twice.
 */
export const app = new Hono();

// ---------------------------------------------------------------------------
// CORS — allow web + admin origins from env list
// ---------------------------------------------------------------------------
app.use(
  '*',
  cors({
    origin: (origin) => {
      const allowed = (process.env.ALLOWED_ORIGINS ?? 'http://localhost:5173,http://localhost:5174')
        .split(',')
        .map((s) => s.trim());
      return allowed.includes(origin ?? '') ? origin : null;
    },
    credentials: true,
  }),
);

// ---------------------------------------------------------------------------
// End-of-game wiring — the registry singleton needs to know how to reach the
// Supabase service client without creating a circular import. We inject here
// at the composition root.
// ---------------------------------------------------------------------------
registry.setOnGameOver((roomId, winnerPlayerId, finalState) => {
  void handleGameOver(roomId, winnerPlayerId, finalState, {
    registry,
    serviceClient: () => serviceClient() as never,
  });
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.route('/', healthRouter);
app.route('/api/saves', savesRouter);
app.route('/api/rooms', roomsRouter);
app.route('/api/profile', profileRouter);
app.route('/', wsRouter);

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
const port = Number(process.env.PORT ?? 8787);

console.log(`riskrask-server listening on :${port}`);

export { websocket };
export default { port, fetch: app.fetch, websocket };
