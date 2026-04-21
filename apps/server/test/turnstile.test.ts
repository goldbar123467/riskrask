/**
 * Unit tests for the Turnstile verifier.
 *
 * We intercept `fetch` so siteverify round-trips don't leave the box.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { isTurnstileRequired, verifyTurnstile } from '../src/auth/turnstile';

const originalFetch = globalThis.fetch;

beforeEach(() => {
  process.env.TURNSTILE_REQUIRED = undefined;
  process.env.TURNSTILE_SECRET = undefined;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('verifyTurnstile', () => {
  test('no-ops (returns true) when Turnstile is not required', async () => {
    expect(isTurnstileRequired()).toBe(false);
    expect(await verifyTurnstile('anything')).toBe(true);
  });

  test('no-ops (returns true) when required but no secret configured', async () => {
    process.env.TURNSTILE_REQUIRED = '1';
    // No secret → verify returns true so local dev doesn't break.
    expect(await verifyTurnstile('anything')).toBe(true);
  });

  test('fails closed (false) when token missing', async () => {
    process.env.TURNSTILE_REQUIRED = '1';
    process.env.TURNSTILE_SECRET = 'shh';
    expect(await verifyTurnstile(null)).toBe(false);
    expect(await verifyTurnstile('')).toBe(false);
  });

  test('returns true when siteverify responds success:true', async () => {
    process.env.TURNSTILE_REQUIRED = '1';
    process.env.TURNSTILE_SECRET = 'shh';
    let capturedBody = '';
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      capturedBody = typeof init?.body === 'string' ? init.body : '';
      void url;
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as unknown as typeof fetch;

    const ok = await verifyTurnstile('good-token', { remoteIp: '1.2.3.4' });
    expect(ok).toBe(true);
    expect(capturedBody).toContain('secret=shh');
    expect(capturedBody).toContain('response=good-token');
    expect(capturedBody).toContain('remoteip=1.2.3.4');
  });

  test('returns false when siteverify responds success:false', async () => {
    process.env.TURNSTILE_REQUIRED = '1';
    process.env.TURNSTILE_SECRET = 'shh';
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ success: false, 'error-codes': ['invalid-input-response'] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })) as unknown as typeof fetch;
    expect(await verifyTurnstile('bad-token')).toBe(false);
  });

  test('returns false on non-2xx siteverify response', async () => {
    process.env.TURNSTILE_REQUIRED = '1';
    process.env.TURNSTILE_SECRET = 'shh';
    globalThis.fetch = (async () =>
      new Response('boom', { status: 500 })) as unknown as typeof fetch;
    expect(await verifyTurnstile('token')).toBe(false);
  });

  test('returns false when fetch throws', async () => {
    process.env.TURNSTILE_REQUIRED = '1';
    process.env.TURNSTILE_SECRET = 'shh';
    globalThis.fetch = (async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;
    expect(await verifyTurnstile('token')).toBe(false);
  });
});
