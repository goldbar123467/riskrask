/**
 * Cloudflare Turnstile server-side verification.
 *
 * Called on anonymous save creation to prevent automated spam. The widget on
 * the client POSTs a token in the `X-Turnstile-Token` (or `cf-turnstile-response`)
 * header; we POST it with our secret to Cloudflare's siteverify endpoint and
 * trust only explicit `success: true` responses.
 *
 * Enabled only when `TURNSTILE_REQUIRED=1` and `TURNSTILE_SECRET` is present;
 * otherwise `verifyTurnstile()` returns true so local dev isn't blocked.
 */

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export interface TurnstileVerifyOptions {
  /** Caller IP, forwarded to Cloudflare for risk scoring (optional). */
  readonly remoteIp?: string | undefined;
  /**
   * Override the siteverify URL (test hook). Production should always use the
   * real Cloudflare endpoint.
   */
  readonly endpoint?: string | undefined;
}

interface SiteverifyResponse {
  readonly success: boolean;
  readonly 'error-codes'?: readonly string[];
  readonly action?: string;
  readonly hostname?: string;
}

export function isTurnstileRequired(): boolean {
  return process.env.TURNSTILE_REQUIRED === '1';
}

/**
 * Verify a Turnstile token. Returns true when the token is valid, false
 * otherwise. If Turnstile is not configured, returns true (no-op) so dev
 * setups don't require the secret.
 */
export async function verifyTurnstile(
  token: string | null | undefined,
  opts: TurnstileVerifyOptions = {},
): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET;
  if (!isTurnstileRequired()) return true;
  if (!secret) return true;
  if (!token) return false;

  const body = new URLSearchParams();
  body.set('secret', secret);
  body.set('response', token);
  if (opts.remoteIp) body.set('remoteip', opts.remoteIp);

  try {
    const res = await fetch(opts.endpoint ?? SITEVERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as SiteverifyResponse;
    return data.success === true;
  } catch {
    return false;
  }
}
