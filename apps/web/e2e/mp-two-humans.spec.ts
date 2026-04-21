import { test } from '@playwright/test';

/**
 * Two-humans multiplayer browser scenario — deferred.
 *
 * What this SHOULD cover once the JWT helper lands:
 *   1. Alice (browser A) navigates /lobby, clicks "Create Room", copies the code.
 *   2. Bob (browser B) navigates /lobby, enters the code, clicks "Join".
 *   3. Alice adds an AI seat (zhukov), both ready up, Alice clicks Launch.
 *   4. Both browsers land on /play/:roomId; the map renders for each.
 *   5. They take turn 1 (Alice → Bob → AI); assert the topbar TURN counter
 *      reads "2" on both browsers and no error banner is visible.
 *
 * Blocker (tracked as "Deferred for a future sprint" in
 * docs/mp-buildout/00-overview.md):
 *
 *   `apps/server/src/auth/verify.ts` calls `client.auth.getUser()` which
 *   requires a JWT issued by the real Supabase Auth server. Playwright cannot
 *   mint such a token without either (a) a running test Supabase project, or
 *   (b) a `apps/server/src/auth/test-jwt.ts` helper that signs a JWT with the
 *   same issuer + anon key for use in NODE_ENV !== 'production'. Until one of
 *   those exists every `/api/rooms` POST will 401 before we can even open the
 *   WS.
 *
 * The server-side equivalent test lives at
 * `apps/server/test/mp-two-humans.test.ts` and exercises the full REST + WS
 * plumbing with a mocked verifier; see `docs/mp-buildout/D-integration-test.md`.
 */
test.fixme(
  'two humans can play a lobby to first turn (needs Supabase test-JWT helper)',
  async ({ browser }) => {
    // TODO(track-F-follow-on): unblock by adding apps/server/src/auth/test-jwt.ts
    // that mints a signed JWT using the same issuer as Supabase Auth, gated by
    // NODE_ENV !== 'production'. See docs/mp-buildout/D-integration-test.md for
    // the full scenario to implement here.
    const alice = await browser.newContext();
    const bob = await browser.newContext();
    await alice.close();
    await bob.close();
  },
);
