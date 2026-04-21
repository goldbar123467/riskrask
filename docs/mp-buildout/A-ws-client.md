# Agent A — Web WebSocket Client + Room Dispatcher

**Branch**: `claude/mp-agent-a-ws-client` (isolated worktree).
**Depends on**: nothing — can ship independently.

## Task

Replace the `apps/web/src/net/ws.ts` stub with a real reconnecting WebSocket
client against the protocol in `packages/shared/src/protocol.ts`. Add a web
`useRoomDispatcher` hook parallel to `useSoloDispatcher`. No UI work — that's
Agent B.

## Files to create or modify (7)

### 1. `apps/web/src/net/protocol.ts` — re-export (NEW, ~5 lines)

```ts
export {
  ClientMsgSchema,
  ServerMsgSchema,
  type ClientMsg,
  type ServerMsg,
  type SeatInfo,
} from '@riskrask/shared';
```

### 2. `apps/web/src/net/ws.ts` — real client (REWRITE, ~180 lines)

Replace the stub with a real client. Requirements:

- Export `interface WsClient`:
  ```ts
  {
    readonly state: 'connecting' | 'open' | 'closed' | 'reconnecting';
    send: (msg: ClientMsg) => void;           // auto-queues if not open
    onMessage: (fn: (msg: ServerMsg) => void) => () => void;  // unsubscribe
    onState:   (fn: (s: WsClient['state']) => void) => () => void;
    close: () => void;
  }
  ```
- `createWsClient(opts: { roomId: string; seatIdx: number; token: string; url?: string }): WsClient`
- **URL**: prefer `opts.url`; else derive from `window.location` (`ws(s)://host:port/api/ws/:roomId?token=...&seat=...`). In tests the caller passes `url`.
- **Send queue**: if `state !== 'open'`, push message onto internal queue and flush on open. Queue capacity 100 — drop oldest with `console.warn` if overflow (prevents runaway memory on long disconnects).
- **Ingress validation**: every frame goes through `ServerMsgSchema.safeParse`; invalid frames call `onMessage` subscribers with a synthetic `{ type: 'error', code: 'INVALID_SERVER_MSG' }` — treat as visible error, don't silently swallow.
- **Heartbeat**: every 20 s send `{ type: 'heartbeat', ts: Date.now() }`.
- **Reconnect**: on `onclose` with code ≠ 1000/1008 (1008 = auth / seat mismatch — permanent), exponential backoff `min(30s, 500ms * 2^n)` up to 6 attempts, then give up and emit `state = 'closed'`. Cap attempts state must be exposed via `onState` transitions.
- **Replay**: on reconnect, include `lastSeq` in the `join` message. The server (Agent C's job) will replay applied deltas above that seq.
- **Lifecycle**: `close()` sets state to `closed`, cancels timers, closes socket with 1000. Idempotent.
- **No React**: this module is plain TS. The hook layer (below) adapts it to React.

### 3. `apps/web/src/game/useRoomDispatcher.ts` — NEW, ~120 lines

Parallel to `useSoloDispatcher.ts`. Signature:

```ts
export function useRoomDispatcher(opts: {
  roomId: string;
  seatIdx: number;
  token: string;
  url?: string;  // tests pass ws:// URL directly
}): {
  connState: WsClient['state'];
  seq: number;
  seats: SeatInfo[];
  sendIntent: (action: Action) => void;
  sendChat: (text: string) => void;
  lastError: { code: string; detail?: string } | null;
};
```

Behavior:

- Owns a single `createWsClient` via `useRef`. Open on mount, close on unmount.
- On `welcome`: calls `useGame.getState().loadState(msg.state as GameState)` to hydrate the store.
- On `applied`: calls `useGame.getState().applyEffects(msg.effects as Effect[])`.
  - Implementation note: the solo dispatcher goes through `dispatch(action)` which both runs the reducer AND returns effects. For multiplayer we trust the server's hash and re-run the reducer locally via `dispatch(action)` — this keeps determinism tight AND yields the same effect stream without trusting the wire. If the local `nextHash` ≠ server's `msg.nextHash`, log a warning and force-hydrate from the next welcome.
  - **Preferred path**: run local `dispatch(msg.action as Action)` inside a try/catch; if throws, call `sendIntent`-level fallback to request a welcome re-sync (client sends `{ type: 'heartbeat', ts }` and relies on server re-syncing; full re-sync is deferred to welcome delta work).
- On `chat`, `presence`, `ai-takeover`, `desync`, `error`: bubble via the returned `lastError` or a side-effect store update (but keep this minimal — no store slice churn; only `loadState` / `applyEffects`).
- `sendIntent(action)`: computes `clientHash` via `hashGameState(currentState)` (re-export from engine) and sends `{ type: 'intent', action, clientHash }`.
- `sendChat(text)` → `{ type: 'chat', text }`.

### 4. `apps/web/src/game/useGame.ts` — ADD `applyEffects` (~15 lines changed)

Add an `applyEffects(effects: Effect[]): void` action to the store. Implementation: funnels through the same log-accumulation path `dispatch` uses today. Pure re-plumb — no behaviour change for solo play (solo still uses `dispatch`).

### 5. `apps/web/src/net/ws.test.ts` — NEW, ~120 lines (vitest)

Minimum coverage:

- Send queues while disconnected, flushes on open.
- Receives a valid `ServerWelcome` frame and emits via `onMessage`.
- Invalid JSON → emits synthetic `error` frame with `code: 'INVALID_SERVER_MSG'`.
- Heartbeat fires at the 20 s interval (use fake timers).
- Reconnect backoff (use fake timers to assert at least 2 retry attempts on a mocked 1011 close).
- `close()` is idempotent.

Use `vitest.useFakeTimers()` + a minimal `class MockWebSocket` that exposes
`readyState`, `onopen/onmessage/onclose`, `send()`, `close()`. Swap
`globalThis.WebSocket` in `beforeEach`, restore in `afterEach`.

### 6. `apps/web/src/game/useRoomDispatcher.test.ts` — NEW, ~80 lines

Minimum coverage:

- Mounting opens a socket to the derived URL.
- `welcome` loads state into the store (`useGame.getState().state` is set).
- `applied` with a valid action dispatches through `useGame.getState().dispatch`.
- Unmount closes the socket.

Use React's `renderHook` from `@testing-library/react`.

### 7. `apps/web/src/test/setup.ts` — EXTEND if needed

Add a WebSocket polyfill check or `vi.stubGlobal('WebSocket', ...)` helper if
useful. Do NOT globally install the mock — tests should opt in.

## Do NOT touch

- `apps/web/src/routes/*` — Agent B owns routes.
- `packages/shared/src/protocol.ts` — frozen contract.
- `apps/server/*` — Agent C owns server.
- `useSoloDispatcher.ts` — solo path must stay 100% untouched to guarantee no
  regression.

## Acceptance

Before reporting done, from the **worktree**:

```sh
cd <worktree>
bun install
bun run typecheck
bun --filter @riskrask/web test
bun --filter @riskrask/shared test
bun run lint
```

All green. If `useGame.ts` changes, confirm the full solo test:
```sh
bun --filter @riskrask/web test -- solo-playthrough
```
is still green.

Commit in scoped groups:
1. `shared:` (if any protocol re-export tweak — probably none)
2. `web(net):` — ws.ts + protocol.ts + tests
3. `web(game):` — useRoomDispatcher + useGame.applyEffects + tests

Push to `claude/mp-agent-a-ws-client`. Report file:line summary + test counts
in the completion message.
