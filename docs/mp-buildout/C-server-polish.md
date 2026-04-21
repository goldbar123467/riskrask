# Agent C — Server Polish (chat persistence, welcome delta, Database.Functions types)

**Branch**: `claude/mp-agent-c-server-polish` (isolated worktree).
**Depends on**: nothing — ships in parallel with Agent A.

## Task

Three small but distinct server improvements. No client-side work. No new
dependencies.

## Files to modify or create (4)

### 1. `apps/server/src/supabase.ts` — EXTEND `Database.Functions` (~60 lines)

Current `Database.Functions` only has `create_save_with_expiry` and
`generate_room_code`. Add typed signatures for every room-lifecycle RPC used
by `apps/server/src/http/rooms.ts`. Reference
`supabase/migrations/0011_rpc_room_lifecycle.sql` for exact return shapes.

```ts
create_room: {
  Args: { p_visibility: 'public'|'private'; p_max_players: number; p_settings: Record<string, unknown> };
  Returns: { id: string; code: string; state: string; ... }[];
};
join_room: {
  Args: { p_code: string };
  Returns: { ... }[];
};
leave_room: {
  Args: { p_room_id: string };
  Returns: { success: boolean }[];
};
set_ready: {
  Args: { p_room_id: string; p_ready: boolean };
  Returns: { success: boolean }[];
};
add_ai_seat: {
  Args: { p_room_id: string; p_arch_id: string };
  Returns: { seat_idx: number }[];
};
launch_game: {
  Args: { p_room_id: string };
  Returns: { game_id: string; state_json: Record<string, unknown> }[];
};
send_chat: {
  Args: { p_room_id: string; p_text: string };
  Returns: { message_id: string; ts: string }[];
};
```

Pull the exact SQL return column list from the migration files. If a column is
unknown, fall back to the widest superset that still compiles at each call
site in `http/rooms.ts`. Do not silently break any existing `.rpc(...)` call.

### 2. `apps/server/src/ws/index.ts` — CHAT PERSISTENCE (~20 lines changed)

Today the `'chat'` branch in `onMessage` (current line ~138) only broadcasts
in-session. Wire it to the `send_chat` RPC:

```ts
case 'chat': {
  const sb = anonClient(token);   // user JWT — respects RLS
  const { data, error } = await sb.rpc('send_chat', {
    p_room_id: session.roomId,
    p_text: msg.data.text,
  });
  if (error) {
    sendJson(ws, { type: 'error', code: 'CHAT_PERSIST_FAILED', detail: error.message });
    return;  // do NOT broadcast — caller can retry
  }
  room.broadcast({
    type: 'chat',
    userId: session.userId,
    text: msg.data.text,
    ts: Date.now(),
  });
  return;
}
```

The `send_chat` RPC already writes to `room_messages` and enforces RLS per
`supabase/migrations/0011_rpc_room_lifecycle.sql`. The broadcast stays the
realtime pathway for connected clients; persistence is the historical record.

### 3. `apps/server/src/ws/index.ts` — WELCOME DELTA REPLAY (~40 lines changed)

Today the `welcome` frame sends a full state snapshot (`state: room.getState()`).
Extend `onOpen` to honour the client's `lastSeq` (already on `ClientJoin` in
`packages/shared/src/protocol.ts`). Note: the `join` message is sent
**after** onOpen completes in the spec; for a real lastSeq delta, parse the
URL query instead (`?seat=2&token=…&lastSeq=17`), and validate it as a
non-negative int:

```ts
const lastSeqRaw = c.req.query('lastSeq');
const lastSeq = lastSeqRaw !== undefined ? Number(lastSeqRaw) : undefined;
```

On welcome:
- If `lastSeq === undefined` or `lastSeq === 0` — send a full welcome (today's behaviour, unchanged).
- Else — look up `room.getEventLog()` and if every entry with `seq > lastSeq` is present in memory, emit the welcome followed by an `applied` per delta:

```ts
sendJson(ws, { type: 'welcome', gameId: room.gameId, seatIdx, state: room.getState(), seats: ..., hash: room.getHash(), seq: room.getSeq() });
for (const entry of room.getEventLog().filter(e => e.seq > lastSeq)) {
  sendJson(ws, {
    type: 'applied',
    seq: entry.seq,
    action: entry.action,
    nextHash: entry.hash,
    effects: entry.effects ?? [],   // if effects aren't logged today, add to the log entry shape; keep back-compat
  });
}
```

If `Room.getEventLog()` does not currently capture `effects`, extend the
event-log entry to carry them. Downstream writers in
`apps/server/src/rooms/Room.ts::applyIntent` must append the effects alongside
the existing `seq / action / hash`. This is a surface-level diff — confirm it
does not change the hash pipeline.

If the event log does not cover all seq numbers above `lastSeq` (e.g., after a
server restart), fall back to full welcome and log a `console.warn`. Clients
see this as a fresh hydrate — acceptable degradation.

### 4. Tests — EXTEND existing server suites

- `apps/server/test/rooms-http.test.ts`: add a case that mocks `send_chat` and
  verifies the WS handler both persists AND broadcasts. Add an error-path case
  where `send_chat` errors out and the client receives `CHAT_PERSIST_FAILED`
  without a broadcast side-effect.
- `apps/server/test/room-turn-loop.test.ts`: add a case that opens a socket
  with `?lastSeq=3` after 5 intents have applied, and asserts exactly 2
  `applied` frames arrive after welcome.
- Confirm the entire server suite passes. No existing test should need to
  change unless the event-log shape does — if effects are now on the log
  entry, update any assertion that reads it.

## Do NOT touch

- `packages/shared/src/protocol.ts` — contract frozen for this sprint; if a
  new error code is needed (`CHAT_PERSIST_FAILED`), it goes in `ServerError`
  via its free-form `code: string` — the schema already permits arbitrary
  string codes.
- `apps/web/*` — Agent A / B territory.

## Acceptance

```sh
bun install
bun run typecheck
bun --filter @riskrask/server test
bun --filter @riskrask/shared test
bun run lint
```

All green. The server suite count should be ≥ 52 (baseline 50 + 2 new).

Commit groups:
1. `server(types):` — Database.Functions RPC signatures
2. `server(ws):` — chat persistence + welcome delta
3. `server(test):` — new test cases

Push to `claude/mp-agent-c-server-polish`.
