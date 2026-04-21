/**
 * Room WebSocket client.
 *
 * Plain TypeScript — no React. The hook layer (`useRoomDispatcher`) adapts
 * this client into the React lifecycle.
 *
 * Responsibilities:
 *   - Open a WS to `/api/ws/:roomId?token=...&seat=...`
 *   - Validate every inbound frame with `ServerMsgSchema` (zod at boundary);
 *     bad frames surface as a synthetic error frame so they are visible, not
 *     silently swallowed.
 *   - Queue outbound sends while disconnected (cap 100, drop-oldest on
 *     overflow with a console warning).
 *   - 20-second heartbeat while open.
 *   - Exponential-backoff reconnect (up to 6 attempts; give up and emit
 *     `closed` after that). Close codes 1000 (normal) and 1008 (auth / seat
 *     mismatch) are terminal and never trigger a reconnect.
 *   - Include `lastSeq` on `join` after a reconnect so the server can replay
 *     applied deltas.
 *   - Idempotent `close()`.
 */

import { type ClientMsg, type ServerMsg, ServerMsgSchema } from './protocol';

export type WsState = 'connecting' | 'open' | 'closed' | 'reconnecting';

export interface WsClient {
  readonly state: WsState;
  send: (msg: ClientMsg) => void;
  onMessage: (fn: (msg: ServerMsg) => void) => () => void;
  onState: (fn: (s: WsState) => void) => () => void;
  close: () => void;
}

export interface WsClientOpts {
  roomId: string;
  seatIdx: number;
  token: string;
  /** Override the derived URL. Tests pass a `ws://` URL directly. */
  url?: string;
}

/** Max queued messages while disconnected. Drops oldest on overflow. */
const SEND_QUEUE_CAP = 100;
/** Heartbeat cadence. */
const HEARTBEAT_MS = 20_000;
/** Reconnect policy. */
const MAX_RECONNECT_ATTEMPTS = 6;
const RECONNECT_BASE_MS = 500;
const RECONNECT_MAX_MS = 30_000;
/** Auth / seat-mismatch close code — never reconnect on this. */
const CODE_AUTH_FAIL = 1008;
const CODE_NORMAL = 1000;

function deriveUrl(opts: WsClientOpts): string {
  if (opts.url !== undefined) return opts.url;
  if (typeof window === 'undefined') {
    throw new Error('createWsClient: no url provided and no window.location available');
  }
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  const path = `/api/ws/${encodeURIComponent(opts.roomId)}`;
  const q = `token=${encodeURIComponent(opts.token)}&seat=${opts.seatIdx}`;
  return `${proto}//${host}${path}?${q}`;
}

export function createWsClient(opts: WsClientOpts): WsClient {
  let state: WsState = 'connecting';
  let socket: WebSocket | null = null;
  let closed = false;
  let attempts = 0;
  let lastSeq: number | undefined;
  const sendQueue: ClientMsg[] = [];
  const messageSubs = new Set<(msg: ServerMsg) => void>();
  const stateSubs = new Set<(s: WsState) => void>();
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  function setState(next: WsState): void {
    if (state === next) return;
    state = next;
    for (const fn of stateSubs) {
      try {
        fn(next);
      } catch (e) {
        console.warn('[ws] state subscriber threw', e);
      }
    }
  }

  function emitMessage(msg: ServerMsg): void {
    if (msg.type === 'welcome' || msg.type === 'applied') {
      lastSeq = msg.seq;
    }
    for (const fn of messageSubs) {
      try {
        fn(msg);
      } catch (e) {
        console.warn('[ws] message subscriber threw', e);
      }
    }
  }

  function stopHeartbeat(): void {
    if (heartbeatTimer !== null) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  }

  function startHeartbeat(): void {
    stopHeartbeat();
    heartbeatTimer = setInterval(() => {
      if (socket && socket.readyState === WebSocket.OPEN) {
        try {
          socket.send(JSON.stringify({ type: 'heartbeat', ts: Date.now() }));
        } catch (e) {
          console.warn('[ws] heartbeat send failed', e);
        }
      }
    }, HEARTBEAT_MS);
  }

  function flushQueue(): void {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    while (sendQueue.length > 0) {
      const msg = sendQueue.shift()!;
      try {
        socket.send(JSON.stringify(msg));
      } catch (e) {
        console.warn('[ws] queued send failed', e);
        // Put it back at the front and bail — socket is likely closing.
        sendQueue.unshift(msg);
        return;
      }
    }
  }

  function sendJoin(): void {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    const joinMsg: ClientMsg = {
      type: 'join',
      roomId: opts.roomId,
      seatIdx: opts.seatIdx,
      ...(lastSeq !== undefined ? { lastSeq } : {}),
    };
    try {
      socket.send(JSON.stringify(joinMsg));
    } catch (e) {
      console.warn('[ws] join send failed', e);
    }
  }

  function scheduleReconnect(): void {
    if (closed) return;
    if (attempts >= MAX_RECONNECT_ATTEMPTS) {
      setState('closed');
      return;
    }
    const delay = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** attempts);
    attempts++;
    setState('reconnecting');
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      if (!closed) connect();
    }, delay);
  }

  function connect(): void {
    if (closed) return;
    const url = deriveUrl(opts);
    setState(attempts === 0 ? 'connecting' : 'reconnecting');

    let s: WebSocket;
    try {
      s = new WebSocket(url);
    } catch (e) {
      console.warn('[ws] constructor threw', e);
      scheduleReconnect();
      return;
    }
    socket = s;

    s.onopen = (): void => {
      if (closed) {
        try {
          s.close(CODE_NORMAL);
        } catch {
          /* ignore */
        }
        return;
      }
      attempts = 0;
      setState('open');
      sendJoin();
      flushQueue();
      startHeartbeat();
    };

    s.onmessage = (ev: MessageEvent): void => {
      if (closed) return;
      let raw: unknown;
      try {
        raw = typeof ev.data === 'string' ? JSON.parse(ev.data) : null;
      } catch {
        raw = null;
      }
      const parsed = ServerMsgSchema.safeParse(raw);
      if (!parsed.success) {
        emitMessage({ type: 'error', code: 'INVALID_SERVER_MSG' });
        return;
      }
      emitMessage(parsed.data);
    };

    s.onerror = (): void => {
      // Swallow — `onclose` will follow with a code and we reconnect there.
    };

    s.onclose = (ev: CloseEvent): void => {
      stopHeartbeat();
      socket = null;
      if (closed) {
        setState('closed');
        return;
      }
      if (ev.code === CODE_NORMAL || ev.code === CODE_AUTH_FAIL) {
        // Terminal: peer asked us to stop, or auth failed — do not reconnect.
        closed = true;
        setState('closed');
        return;
      }
      scheduleReconnect();
    };
  }

  function send(msg: ClientMsg): void {
    if (closed) return;
    if (socket && socket.readyState === WebSocket.OPEN) {
      try {
        socket.send(JSON.stringify(msg));
        return;
      } catch (e) {
        console.warn('[ws] direct send failed — queueing', e);
      }
    }
    if (sendQueue.length >= SEND_QUEUE_CAP) {
      const dropped = sendQueue.shift();
      console.warn('[ws] send queue full — dropping oldest', dropped?.type);
    }
    sendQueue.push(msg);
  }

  function onMessage(fn: (msg: ServerMsg) => void): () => void {
    messageSubs.add(fn);
    return () => {
      messageSubs.delete(fn);
    };
  }

  function onState(fn: (s: WsState) => void): () => void {
    stateSubs.add(fn);
    return () => {
      stateSubs.delete(fn);
    };
  }

  function close(): void {
    if (closed) return;
    closed = true;
    stopHeartbeat();
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (socket) {
      try {
        socket.close(CODE_NORMAL);
      } catch {
        /* ignore */
      }
      socket = null;
    }
    setState('closed');
  }

  // Kick off the first connect.
  connect();

  return {
    get state() {
      return state;
    },
    send,
    onMessage,
    onState,
    close,
  };
}
