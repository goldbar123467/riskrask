/**
 * JWT verification helpers for the Bun server.
 *
 * verifySupabaseJwt()  — validates a Supabase Auth JWT.
 * verifyAdminJwt()     — validates a Cloudflare Access JWT for admin routes
 *                         (stub for now; Track G will implement fully).
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
    const { data: { user }, error } = await client.auth.getUser();
    if (error || !user) return null;
    return { id: user.id, email: user.email };
  } catch {
    return null;
  }
}

/**
 * Verify Cloudflare Access JWT assertion header.
 * Stub: always returns null until Track G implements JWKS verification.
 * TODO(track-g): implement real CF Access JWT verification.
 */
export async function verifyAdminJwt(_cfJwt: string | null): Promise<{ email: string } | null> {
  // STUB — Track G will implement JWKS fetch + signature check
  return null;
}
