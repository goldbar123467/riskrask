import { describe, expect, test } from 'bun:test';
import app from '../src/index';

describe('server', () => {
  test('/health returns ok', async () => {
    const res = await app.fetch(new Request('http://localhost/health'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });
});
