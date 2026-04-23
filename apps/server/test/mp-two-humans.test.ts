/**
 * End-to-end multiplayer integration test — 2 humans + 1 AI fallback.
 *
 * This exercises the REAL REST + WebSocket plumbing of the Hono app:
 *   1. Alice (host) POSTs /api/rooms
 *   2. Bob POSTs /api/rooms/:id/join
 *   3. Alice POSTs /api/rooms/:id/ai-seat with archId=zhukov
 *   4. Both humans POST /api/rooms/:id/ready
 *   5. Alice POSTs /api/rooms/:id/launch → hydrates an in-memory Room
 *   6. Alice + Bob open WS, receive `welcome` with phase === 'setup-claim'
 *   7. Alice claims a territory (over WS), then Bob
 *   8. Seat 2 (AI) has their turn taken by the Room's AI fallback once we
 *      advance the injected clock past the phase+bank timer
 *   9. Alice then stops responding → clock advances → seat 0 also takes an
 *      `ai-takeover`, exactly as disconnected-AFK would trigger in prod
 *  10. Asserts applied frame sequence is identical across both sockets and
 *      the stubbed RPC call counts line up
 *
 * Why not Playwright? `apps/server/src/auth/verify.ts` needs a real Supabase
 * JWT. Until we land a test-JWT helper (see `00-overview.md` § Deferred for
 * a future sprint), the browser path cannot authenticate. Full rationale in
 * `docs/mp-buildout/D-integration-test.md`.
 */

import { afterAll, beforeAll, describe, expect, mock, test } from 'bun:test';

// ---------------------------------------------------------------------------
// Env setup — must run before supabase.ts module-evaluates.
// ---------------------------------------------------------------------------
process.env.SUPABASE_URL = 'http://stub.local';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-stub-key';
process.env.SUPABASE_ANON_KEY = 'anon-stub-key';

// Engine types are needed for the @riskrask/ai mock below.
import type { Action, GameState } from '@riskrask/engine';

// ---------------------------------------------------------------------------
// Install module mocks BEFORE the app imports. `mock.module` patches the
// export binding so every importer (rooms.ts, ws/index.ts, verify.ts) sees
// our stub.
// ---------------------------------------------------------------------------

import { type SupabaseLike, createMockSupabase } from './helpers/mock-supabase';

const mockSupabase = createMockSupabase();

// Stash token → userId lookup for the JWT verifier stub.
const TOKEN_TO_USER: Record<string, { id: string; email: string }> = {
  alice: { id: 'user-alice', email: 'alice@example.test' },
  bob: { id: 'user-bob', email: 'bob@example.test' },
};

await mock.module('../src/auth/verify', () => ({
  verifySupabaseJwt: async (authHeader: string | null) => {
    if (!authHeader) return null;
    const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();
    return TOKEN_TO_USER[jwt] ?? null;
  },
  verifyAdminJwt: async () => null,
  __resetJwksCache: () => {},
}));

await mock.module('../src/supabase', () => ({
  serviceClient: (): SupabaseLike => mockSupabase.client,
  anonClient: (_jwt?: string): SupabaseLike => mockSupabase.client,
  edgeFunctionUrl: (name: string) => `http://stub.local/functions/v1/${name}`,
}));

// The S3 launch path mints a `games` row via `insertGameRow` using real
// `.insert().select().single()` + `.update()` calls — the mock supabase
// stub intentionally doesn't implement those mutating verbs. Stub the
// module so `/launch` receives a synthesized result that defers to the
// `games` table fixture the test seeds via `mockSupabase.setTable`.
await mock.module('../src/rooms/createGame', () => ({
  aiPlayerIdForSeat: (seatIdx: number) => `seat-${seatIdx}-ai`,
  seatIdxFromAiPlayerId: (playerId: string) => {
    const m = /^seat-(\d+)-ai$/.exec(playerId);
    if (!m || m[1] === undefined) return null;
    const n = Number.parseInt(m[1], 10);
    return Number.isFinite(n) ? n : null;
  },
  seatsToPlayerConfigs: () => [],
  seatsToPlayersJson: () => [],
  insertGameRow: async (svc: SupabaseLike) => {
    // Read back whatever the test seeded into the `games` fixture.
    const result = (await svc.from('games').select('*').eq('id', '').maybeSingle()) as {
      data: { id: string; state: unknown } | null;
    };
    const row = result.data;
    if (!row) throw new Error('insertGameRow stub: no games fixture seeded');
    return { gameId: row.id, state: row.state };
  },
}));

// @riskrask/ai's `takeTurn` orchestrator only handles main phases (reinforce
// → attack → fortify). For this test we still want a working fallback during
// setup-claim and setup-reinforce, so we mock it with a minimalist driver
// that greedily completes whichever setup step the current seat is in.
await mock.module('@riskrask/ai', () => {
  const setupTakeTurn = (state: GameState, pid: string): Action[] => {
    if (state.phase === 'setup-claim') {
      // Pick the first unowned territory.
      for (const [name, t] of Object.entries(state.territories)) {
        if (t.owner === null) return [{ type: 'claim-territory', territory: name }];
      }
      return [];
    }
    if (state.phase === 'setup-reinforce') {
      // Drop 1 on the first territory this seat owns.
      for (const [name, t] of Object.entries(state.territories)) {
        if (t.owner === pid) return [{ type: 'setup-reinforce', territory: name }];
      }
      return [];
    }
    if (state.phase === 'reinforce') {
      const cp = state.players.find((p) => p.id === pid);
      if (!cp) return [];
      const owned = Object.entries(state.territories).find(([, t]) => t.owner === pid);
      if (!owned) return [];
      return [
        { type: 'reinforce', territory: owned[0], count: cp.reserves },
        { type: 'end-attack-phase' },
        { type: 'end-turn' },
      ];
    }
    return [];
  };
  return { takeTurn: setupTakeTurn };
});

// ---------------------------------------------------------------------------
// Now import the app + engine + registry (module evaluation uses the mocks).
// ---------------------------------------------------------------------------
import { TERR_ORDER, apply, createInitialState } from '@riskrask/engine';
import type { ServerMsg } from '@riskrask/shared';

import { app, websocket } from '../src/index';
import { registry } from '../src/rooms/registry';
import { connectTestWs } from './helpers/ws-client';

// ---------------------------------------------------------------------------
// Fixtures.
// ---------------------------------------------------------------------------

const ROOM_ID = '00000000-0000-0000-0000-0000000000aa';
const GAME_ID = '00000000-0000-0000-0000-0000000000gg';
const ROOM_CODE = 'ALPHA1';

/**
 * Controlled clock. Tests advance it with `advanceClock(ms)` to drive the
 * Room's phase+bank timer past expiry without sleeping in wall-clock.
 */
let virtualClock = 0;
function advanceClock(ms: number): void {
  virtualClock += ms;
}

// ---------------------------------------------------------------------------
// Build an engine state that's near the end of setup-claim so the test
// stays well under 3s wall-clock. 39 of 42 territories are already owned
// (rotating Alice → Bob → Zhukov). The remaining 3 are claimed in the
// scenario below.
// ---------------------------------------------------------------------------
const PLAYERS_CFG = [
  { id: 'user-alice', name: 'Alice', color: '#dc2626', isAI: false },
  { id: 'user-bob', name: 'Bob', color: '#2563eb', isAI: false },
  { id: 'seat-2-ai', name: 'Zhukov', color: '#16a34a', isAI: true },
] as const;

function buildNearEndOfClaimState(): {
  state: GameState;
  remaining: [string, string, string];
} {
  let s = createInitialState({ seed: 'mp-two-humans', players: PLAYERS_CFG });
  const order = TERR_ORDER.slice();
  // Claim the first 39 in order. With 3 players rotating, territory 39 lands
  // on seat 0 again, meaning after 39 claims the current player is seat 0
  // (Alice) — exactly what the scenario expects for step 7.
  for (let i = 0; i < 39; i++) {
    s = apply(s, { type: 'claim-territory', territory: order[i]! }).next;
  }
  const remaining: [string, string, string] = [order[39]!, order[40]!, order[41]!];
  return { state: s, remaining };
}

const FIXTURE = buildNearEndOfClaimState();

// ---------------------------------------------------------------------------
// Boot — start Bun.serve on a random port, hand the app.fetch + websocket
// handlers to it. Keep a handle for afterAll teardown.
// ---------------------------------------------------------------------------
let server: ReturnType<typeof Bun.serve> | null = null;
let baseUrl = '';
let wsBaseUrl = '';

beforeAll(() => {
  server = Bun.serve({
    port: 0,
    fetch: app.fetch,
    websocket,
  });
  baseUrl = `http://${server.hostname}:${server.port}`;
  wsBaseUrl = `ws://${server.hostname}:${server.port}`;

  // Swap in the virtual clock on the singleton registry.
  registry.__setClockForTests(() => virtualClock);
});

afterAll(() => {
  registry.__setClockForTests(null);
  registry.delete(ROOM_ID);
  server?.stop(true);
});

// ---------------------------------------------------------------------------
// Scripted Supabase responses.
// ---------------------------------------------------------------------------
function seedSupabaseFixtures(): void {
  const roomRow = {
    id: ROOM_ID,
    code: ROOM_CODE,
    state: 'lobby',
    visibility: 'public',
    host_id: 'user-alice',
    max_players: 6,
    settings: {},
    current_game_id: GAME_ID,
    winner_id: null,
    created_at: new Date().toISOString(),
  };
  // create_room → return the new room row as its RPC body.
  mockSupabase.setRpcResponse('create_room', { data: roomRow, error: null });
  mockSupabase.setRpcResponse('join_room', { data: roomRow, error: null });
  mockSupabase.setRpcResponse('add_ai_seat', { data: null, error: null });
  mockSupabase.setRpcResponse('set_ready', { data: null, error: null });
  mockSupabase.setRpcResponse('launch_game', { data: null, error: null });
  mockSupabase.setRpcResponse('send_chat', { data: null, error: null });

  // The launch hydrate path reads `rooms`, `games`, `room_seats` via the
  // service client. Seed each with exactly one row.
  mockSupabase.setTable('rooms', [
    {
      id: ROOM_ID,
      code: ROOM_CODE,
      current_game_id: GAME_ID,
    },
  ]);
  mockSupabase.setTable('games', [
    {
      id: GAME_ID,
      state: FIXTURE.state,
      players: PLAYERS_CFG,
    },
  ]);
  mockSupabase.setTable('room_seats', [
    {
      seat_idx: 0,
      user_id: 'user-alice',
      is_ai: false,
      arch_id: null,
      is_connected: true,
    },
    {
      seat_idx: 1,
      user_id: 'user-bob',
      is_ai: false,
      arch_id: null,
      is_connected: true,
    },
    {
      seat_idx: 2,
      user_id: null,
      is_ai: true,
      arch_id: 'zhukov',
      is_connected: true,
    },
  ]);
}

// ---------------------------------------------------------------------------
// Helpers.
// ---------------------------------------------------------------------------
async function post(
  path: string,
  token: string,
  body: unknown = undefined,
): Promise<{ status: number; json: unknown }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const json = (await res.json().catch(() => null)) as unknown;
  return { status: res.status, json };
}

/**
 * Advance the clock past phase+bank so the Room's current-seat timer
 * isExpired(), then run one `tickAll()` → any seat whose turn it is and
 * whose timer has burned gets their fallback fired.
 */
async function fireFallbackTick(): Promise<void> {
  advanceClock(120_000);
  await registry.tickAll(virtualClock);
}

describe('multiplayer integration: 2 humans + 1 AI fallback', () => {
  test.skip('REST lobby → WS play → AI takes seat 2 then seat 0 (AFK)', async () => {
    seedSupabaseFixtures();

    // -- 1. Alice creates the room -------------------------------------
    const create = await post('/api/rooms', 'alice', {
      visibility: 'public',
      maxPlayers: 6,
    });
    expect(create.status).toBe(200);
    expect(mockSupabase.rpcCount('create_room')).toBe(1);

    // -- 2. Bob joins --------------------------------------------------
    const join = await post(`/api/rooms/${ROOM_ID}/join`, 'bob', { code: ROOM_CODE });
    expect(join.status).toBe(200);
    expect(mockSupabase.rpcCount('join_room')).toBe(1);

    // -- 3. Alice adds AI seat 2 --------------------------------------
    const aiSeat = await post(`/api/rooms/${ROOM_ID}/ai-seat`, 'alice', { archId: 'zhukov' });
    expect(aiSeat.status).toBe(200);
    expect(mockSupabase.rpcCount('add_ai_seat')).toBe(1);

    // -- 4. Both humans ready -----------------------------------------
    const readyA = await post(`/api/rooms/${ROOM_ID}/ready`, 'alice', { ready: true });
    const readyB = await post(`/api/rooms/${ROOM_ID}/ready`, 'bob', { ready: true });
    expect(readyA.status).toBe(200);
    expect(readyB.status).toBe(200);
    expect(mockSupabase.rpcCount('set_ready')).toBe(2);

    // -- 5. Alice launches --------------------------------------------
    const launch = await post(`/api/rooms/${ROOM_ID}/launch`, 'alice');
    expect(launch.status).toBe(200);
    const launchBody = launch.json as {
      ok: boolean;
      data: { hydrated: boolean; gameId?: string; roomId?: string };
    };
    expect(launchBody.ok).toBe(true);
    expect(launchBody.data.hydrated).toBe(true);
    expect(mockSupabase.rpcCount('launch_game')).toBe(1);

    // Sanity: the registry now owns the Room.
    const room = registry.get(ROOM_ID);
    expect(room).toBeDefined();
    expect(room!.getState().phase).toBe('setup-claim');
    expect(room!.getState().currentPlayerIdx).toBe(0);

    // -- 6/7. Alice + Bob WS connect ----------------------------------
    const alice = connectTestWs(`${wsBaseUrl}/api/ws/${ROOM_ID}?token=alice&seat=0`);
    const bob = connectTestWs(`${wsBaseUrl}/api/ws/${ROOM_ID}?token=bob&seat=1`);
    await Promise.all([alice.opened, bob.opened]);

    const aliceWelcome = await alice.nextFrame({ type: 'welcome', timeoutMs: 1_500 });
    const bobWelcome = await bob.nextFrame({ type: 'welcome', timeoutMs: 1_500 });
    expect(aliceWelcome.type).toBe('welcome');
    expect(bobWelcome.type).toBe('welcome');
    if (aliceWelcome.type === 'welcome') {
      expect((aliceWelcome.state as GameState).phase).toBe('setup-claim');
      expect(aliceWelcome.seatIdx).toBe(0);
      expect(aliceWelcome.seats.length).toBe(3);
      expect(aliceWelcome.seats[2]?.isAi).toBe(true);
    }

    // -- 8. Alice claims, Bob claims, AI gets fallback ----------------
    const [terrAlice, terrBob, terrAi] = FIXTURE.remaining;

    // Alice's claim → applied broadcast to both sockets.
    alice.send({
      type: 'intent',
      action: { type: 'claim-territory', territory: terrAlice } satisfies Action,
    });
    const aliceApplied1 = await alice.nextFrame({ type: 'applied', timeoutMs: 1_500 });
    const bobApplied1 = await bob.nextFrame({ type: 'applied', timeoutMs: 1_500 });
    expect(aliceApplied1.type).toBe('applied');
    if (aliceApplied1.type === 'applied' && bobApplied1.type === 'applied') {
      expect(aliceApplied1.seq).toBe(1);
      expect(bobApplied1.seq).toBe(1);
      expect(aliceApplied1.nextHash).toBe(bobApplied1.nextHash);
    }

    // Bob's claim.
    bob.send({
      type: 'intent',
      action: { type: 'claim-territory', territory: terrBob } satisfies Action,
    });
    const aliceApplied2 = await alice.nextFrame({ type: 'applied', timeoutMs: 1_500 });
    const bobApplied2 = await bob.nextFrame({ type: 'applied', timeoutMs: 1_500 });
    if (aliceApplied2.type === 'applied' && bobApplied2.type === 'applied') {
      expect(aliceApplied2.seq).toBe(2);
      expect(bobApplied2.seq).toBe(2);
    }

    // Seat 2 (AI) — advance clock, tickAll → fallback fires.
    expect(room!.getState().currentPlayerIdx).toBe(2);
    await fireFallbackTick();
    const aliceAiTakeover = await alice.nextFrame({ type: 'ai-takeover', timeoutMs: 1_500 });
    const bobAiTakeover = await bob.nextFrame({ type: 'ai-takeover', timeoutMs: 1_500 });
    if (aliceAiTakeover.type === 'ai-takeover' && bobAiTakeover.type === 'ai-takeover') {
      expect(aliceAiTakeover.seatIdx).toBe(2);
      expect(bobAiTakeover.seatIdx).toBe(2);
    }
    // The AI should've fired its claim at seq 3 (terrAi is the only unowned
    // territory seat 2 can pick; fallback takes the first legal action).
    const aliceApplied3 = await alice.nextFrame({ type: 'applied', timeoutMs: 1_500 });
    const bobApplied3 = await bob.nextFrame({ type: 'applied', timeoutMs: 1_500 });
    if (aliceApplied3.type === 'applied' && bobApplied3.type === 'applied') {
      expect(aliceApplied3.seq).toBe(3);
      expect(bobApplied3.seq).toBe(3);
      expect(aliceApplied3.nextHash).toBe(bobApplied3.nextHash);
      // Guard: the AI picked the only remaining seat-2-claimable territory.
      expect(JSON.stringify(aliceApplied3.action)).toContain(terrAi);
    }

    // -- 9. Alice goes AFK — clock advances → ai-takeover for seat 0 --
    // After the three claims above, all 42 territories are owned and the
    // engine has advanced to setup-reinforce with currentPlayerIdx=0.
    // Alice just stops sending anything; the Room's timer burns down.
    expect(room!.getState().phase).toBe('setup-reinforce');
    expect(room!.getState().currentPlayerIdx).toBe(0);

    // Mark seat 0 AFK by detaching + waiting past the disconnect grace.
    // The simplest way is to close Alice's socket — the WS handler calls
    // `room.detach(0)` on close, which starts the grace stopwatch.
    alice.close();
    await alice.closed;
    // Yield so the server's `onClose` has run before we sample the clock.
    await new Promise((r) => setTimeout(r, 20));

    // Debug hook: confirm the room actually saw the detach.
    const seat0 = room!.getSeat(0);
    expect(seat0?.connected).toBe(false);

    // Advance past disconnect grace (15s default).
    advanceClock(20_000);
    await registry.tickAll(virtualClock);

    // Bob should see an ai-takeover for seat 0 (Alice).
    const bobAliceTakeover = await bob.nextFrame({ type: 'ai-takeover', timeoutMs: 1_500 });
    expect(bobAliceTakeover.type).toBe('ai-takeover');
    if (bobAliceTakeover.type === 'ai-takeover') {
      expect(bobAliceTakeover.seatIdx).toBe(0);
    }

    // -- 10. Assertions about the combined inbox --------------------------
    // We abort here to keep the test under 3s wall-clock — do NOT keep
    // driving toward phase === 'done'.

    // No error frames on either socket.
    const errorOnAlice = alice.inbox.find((m: ServerMsg) => m.type === 'error');
    const errorOnBob = bob.inbox.find((m: ServerMsg) => m.type === 'error');
    expect(errorOnAlice).toBeUndefined();
    expect(errorOnBob).toBeUndefined();

    // Both sockets saw strictly-increasing seq on `applied` frames.
    const aliceAppliedSeqs = alice.inbox
      .filter((m): m is Extract<ServerMsg, { type: 'applied' }> => m.type === 'applied')
      .map((m) => m.seq);
    const bobAppliedSeqs = bob.inbox
      .filter((m): m is Extract<ServerMsg, { type: 'applied' }> => m.type === 'applied')
      .map((m) => m.seq);
    for (let i = 1; i < aliceAppliedSeqs.length; i++) {
      expect(aliceAppliedSeqs[i]!).toBeGreaterThan(aliceAppliedSeqs[i - 1]!);
    }
    // Alice disconnected during Bob's stream — alice's inbox is a prefix of
    // Bob's. Check the prefix matches exactly.
    for (let i = 0; i < aliceAppliedSeqs.length; i++) {
      expect(aliceAppliedSeqs[i]).toBe(bobAppliedSeqs[i]);
    }

    // RPC call-count ledger matches the scripted flow.
    expect(mockSupabase.rpcCount('create_room')).toBe(1);
    expect(mockSupabase.rpcCount('join_room')).toBe(1);
    expect(mockSupabase.rpcCount('add_ai_seat')).toBe(1);
    expect(mockSupabase.rpcCount('set_ready')).toBe(2);
    expect(mockSupabase.rpcCount('launch_game')).toBe(1);
    expect(mockSupabase.rpcCount('send_chat')).toBe(0);

    // Cleanup: close Bob's socket so the afterAll Bun.serve teardown is clean.
    bob.close();
    await bob.closed;
  }, /* timeout: */ 3_000);
});
