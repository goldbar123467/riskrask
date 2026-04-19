import { Hono } from 'hono';
import { cors } from 'hono/cors';

const app = new Hono();

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

app.get('/health', (c) =>
  c.json({ ok: true, service: 'riskrask-server', version: process.env.GIT_SHA ?? 'dev' }),
);

app.get('/ready', (c) => c.json({ ok: true }));

const port = Number(process.env.PORT ?? 8787);

// biome-ignore lint/suspicious/noConsole: boot log is intentional
console.log(`riskrask-server listening on :${port}`);

export default { port, fetch: app.fetch };
