import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { healthRouter } from './http/health';
import { roomsRouter } from './http/rooms';
import { savesRouter } from './http/saves';
import { websocket, wsRouter } from './ws';

const app = new Hono();

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
// Routes
// ---------------------------------------------------------------------------
app.route('/', healthRouter);
app.route('/api/saves', savesRouter);
app.route('/api/rooms', roomsRouter);
app.route('/', wsRouter);

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
const port = Number(process.env.PORT ?? 8787);

console.log(`riskrask-server listening on :${port}`);

export default { port, fetch: app.fetch, websocket };
