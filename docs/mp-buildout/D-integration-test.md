# Agent D — End-to-End Multiplayer Integration Test

**Branch**: `claude/mp-agent-d-e2e` (isolated worktree).
**Depends on**: Agents A, B, C merged.

## Why not Playwright?

`apps/server/src/auth/verify.ts` requires a real Supabase-issued JWT. Without a
test-JWT helper (out of scope for this sprint), a browser-level Playwright
scenario for the 2-human flow will 401 at the `/api/rooms` POST. Instead this
agent writes a **server-side integration test** that exercises the full flow
through the real REST + WebSocket plumbing with a mocked JWT verifier, plus
lands a `.fixme()` Playwright stub that documents the Supabase-helper gap for
a future sprint.

## Task

### 1. `apps/server/test/mp-two-humans.test.ts` — NEW, ~220 lines

Drive a full 2-human + 1 AI-fallback turn loop through the real Hono app.

Setup:

- Import the Hono app factory (if not exposed, export it from `apps/server/src/index.ts`).
- Stub `verifySupabaseJwt` with a per-test mock that returns `{ id: 'user-alice' }` or `{ id: 'user-bob' }` based on the token string.
- Stub `serviceClient()` with an in-memory fake that records RPC calls and returns scripted responses (`create_room` / `join_room` / `launch_game` / `add_ai_seat` / `send_chat` / `set_ready`).
- Spin up the app with `Bun.serve({ fetch: app.fetch, websocket })` on a random port.
- Alice and Bob get their own `WebSocket` clients — open in parallel.

Scenario:

1. Alice POSTs `/api/rooms` (host). Receives `roomId`.
2. Bob POSTs `/api/rooms/:id/join` with the room code.
3. Alice POSTs `/api/rooms/:id/ai-seat` with `{ archId: 'zhukov' }`.
4. Both humans POST `/api/rooms/:id/ready { ready: true }`.
5. Alice POSTs `/api/rooms/:id/launch`.
6. Alice WS connects to `/api/ws/:roomId?token=alice&seat=0`. Expects `welcome` with `state.phase === 'setup-claim'`.
7. Bob WS connects to `/api/ws/:roomId?token=bob&seat=1`. Expects `welcome`.
8. Drive the setup phase: Alice claims a territory, Bob claims, AI (seat 2) is stepped via the room's own AI fallback by advancing the timer past the 90 s + 15 s bank. (Use `registry.forceTick()` or expose a test helper on `Room` that deterministically advances the turn timer.)
9. Once setup completes, Alice goes AFK — stop her socket from sending `heartbeat`. After the bank expires, assert the server broadcasts `ai-takeover` for seat 0 and her turn is played by the fallback AI.
10. Assert that both Alice's and Bob's WS inboxes receive identical `applied` streams (same sequence, same hashes).

Assertions to encode:

- Neither socket ever receives an `error` frame during the happy path.
- `seq` is monotonically increasing and equal across both sockets.
- `state.phase === 'done'` is NEVER reached within this test — we abort after
  the AI takeover fires to keep the test under 3 s wall-clock.
- Call counts on the stubbed service client match the expected RPC sequence:
  `create_room` × 1, `join_room` × 1, `add_ai_seat` × 1, `set_ready` × 2,
  `launch_game` × 1, `send_chat` × 0 (we didn't chat).

Key test-infrastructure helpers to add:

- `apps/server/test/helpers/mock-supabase.ts` — fluent RPC stub builder.
- `apps/server/test/helpers/ws-client.ts` — Bun-side `WebSocket` wrapper that
  exposes `async nextFrame({ type: string, timeoutMs: number })`.
- `Room.forceTick(ms: number)` — add a test-only method that advances the
  internal timer by `ms`. Guard the method with `if (!process.env.BUN_TEST) return;`
  to prevent prod misuse. (Alternatively: inject `now: () => number` into the
  Room constructor and pass a controllable clock in tests. Prefer this if it
  doesn't add too much surface.)

### 2. `e2e/mp-two-humans.spec.ts` — `.fixme()` stub (~30 lines)

Single test that describes the future browser scenario and marks it `.fixme()`
with a TODO block:

```ts
test.fixme('two humans can play a lobby to first turn (needs Supabase test-JWT helper)', async ({ browser }) => {
  // TODO(track-F-follow-on): see docs/mp-buildout/D-integration-test.md
  // Blocker: apps/server/src/auth/verify.ts requires a real Supabase JWT.
  // Unblock: add apps/server/src/auth/test-jwt.ts that mints a signed JWT using
  // the same issuer as Supabase Auth, gated by NODE_ENV !== 'production'.
});
```

Place under the existing `apps/web/e2e/` directory (see `apps/web/playwright.config.ts`).

### 3. Documentation

Append one section to `docs/mp-buildout/00-overview.md` titled "Deferred for a
future sprint" that lists the JWT helper as the concrete blocker for real
Playwright coverage.

## Do NOT touch

- `apps/web/src/*` — already shipped by A + B.
- Shared protocol — contract frozen.

## Acceptance

```sh
bun install
bun run typecheck
bun --filter @riskrask/server test
bun run lint
```

All green. The server suite should grow by exactly one file (+ optionally its
helpers). Expected test count delta: baseline post-C is 52; post-D is 53+.

Commit groups:
1. `server(test-infra):` — mock-supabase helper + ws-client helper + Room.forceTick (or clock injection)
2. `server(test):` — mp-two-humans.test.ts
3. `test(e2e):` — Playwright stub
4. `docs:` — overview update

Push to `claude/mp-agent-d-e2e`.
