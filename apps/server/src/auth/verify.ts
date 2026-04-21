/**
 * JWT verification helpers for the Bun server.
 *
 * verifySupabaseJwt()  — validates a Supabase Auth JWT.
 * verifyAdminJwt()     — validates a Cloudflare Access JWT against the tenant
 *                         JWKS and required audience.
 */

import { anonClient } from '../supabase';

export interface VerifiedUser {
  id: string;
  email: string | undefined;
}

/**
 * Extract and verify a Supabase JWT from an Authorization: Bearer <jwt> header.
 * Returns null when the JWT is absent, malformed, or expired.
 */
export async function verifySupabaseJwt(authHeader: string | null): Promise<VerifiedUser | null> {
  if (!authHeader) return null;
  const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!jwt) return null;

  try {
    const client = anonClient(jwt);
    const {
      data: { user },
      error,
    } = await client.auth.getUser();
    if (error || !user) return null;
    return { id: user.id, email: user.email };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Cloudflare Access JWT verification
//
// Cloudflare Access forwards a signed JWT on the `Cf-Access-Jwt-Assertion`
// header. The token is signed with RS256; the public keys live at
// `https://<team>.cloudflareaccess.com/cdn-cgi/access/certs` and the expected
// audience is the per-app AUD tag.
// ---------------------------------------------------------------------------

interface Jwk {
  readonly kid: string;
  readonly kty: string;
  readonly n: string;
  readonly e: string;
  readonly alg?: string;
}

interface JwksDoc {
  readonly keys: readonly Jwk[];
}

interface CachedJwks {
  readonly fetchedAt: number;
  readonly keys: readonly Jwk[];
}

const JWKS_TTL_MS = 60 * 60 * 1000; // 1 hour
let jwksCache: CachedJwks | null = null;

function certsUrl(teamDomain: string): string {
  const host = teamDomain.includes('.') ? teamDomain : `${teamDomain}.cloudflareaccess.com`;
  return `https://${host}/cdn-cgi/access/certs`;
}

async function loadJwks(teamDomain: string): Promise<readonly Jwk[]> {
  const now = Date.now();
  if (jwksCache && now - jwksCache.fetchedAt < JWKS_TTL_MS) {
    return jwksCache.keys;
  }
  const res = await fetch(certsUrl(teamDomain));
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
  const doc = (await res.json()) as JwksDoc;
  jwksCache = { fetchedAt: now, keys: doc.keys };
  return doc.keys;
}

function b64urlDecode(input: string): Uint8Array {
  const pad = '='.repeat((4 - (input.length % 4)) % 4);
  const b64 = (input + pad).replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function importJwkPublicKey(jwk: Jwk): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'jwk',
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
}

/**
 * Verify a Cloudflare Access JWT. Checks signature against the tenant JWKS,
 * the `aud` claim against CLOUDFLARE_ACCESS_AUD, and `exp` / `nbf`.
 *
 * Required env:
 *  - CF_ACCESS_TEAM_DOMAIN — e.g. "upsidedownatlas" or the full cloudflareaccess.com host
 *  - CF_ACCESS_AUD        — per-app AUD tag from CF dashboard
 *
 * Returns null when the header is absent, malformed, or fails verification.
 */
export async function verifyAdminJwt(cfJwt: string | null): Promise<{ email: string } | null> {
  if (!cfJwt) return null;
  const teamDomain = process.env.CF_ACCESS_TEAM_DOMAIN;
  const audience = process.env.CF_ACCESS_AUD;
  if (!teamDomain || !audience) return null;

  const parts = cfJwt.split('.');
  if (parts.length !== 3) return null;
  const [rawHeader, rawPayload, rawSig] = parts as [string, string, string];

  let header: { alg?: string; kid?: string };
  let payload: {
    aud?: string | readonly string[];
    email?: string;
    exp?: number;
    nbf?: number;
    iss?: string;
  };
  try {
    header = JSON.parse(new TextDecoder().decode(b64urlDecode(rawHeader)));
    payload = JSON.parse(new TextDecoder().decode(b64urlDecode(rawPayload)));
  } catch {
    return null;
  }

  if (header.alg !== 'RS256' || !header.kid) return null;

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp !== undefined && now >= payload.exp) return null;
  if (payload.nbf !== undefined && now < payload.nbf) return null;

  const aud = payload.aud;
  const audMatches = Array.isArray(aud) ? aud.includes(audience) : aud === audience;
  if (!audMatches) return null;

  let keys: readonly Jwk[];
  try {
    keys = await loadJwks(teamDomain);
  } catch {
    return null;
  }
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) return null;

  try {
    const key = await importJwkPublicKey(jwk);
    const signed = new TextEncoder().encode(`${rawHeader}.${rawPayload}`);
    const signature = b64urlDecode(rawSig);
    const ok = await crypto.subtle.verify(
      { name: 'RSASSA-PKCS1-v1_5' },
      key,
      signature as unknown as ArrayBuffer,
      signed as unknown as ArrayBuffer,
    );
    if (!ok) return null;
  } catch {
    return null;
  }

  const email = payload.email;
  if (!email) return null;
  return { email };
}

/** Internal: reset the JWKS cache (test use). */
export function __resetJwksCache(): void {
  jwksCache = null;
}
