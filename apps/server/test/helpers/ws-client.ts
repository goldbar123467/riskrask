/**
 * Bun-side WebSocket wrapper for integration tests.
 *
 * Wraps the platform `WebSocket` with:
 *   - a promise that resolves when the socket is `open`
 *   - an in-memory inbox of parsed `ServerMsg` frames
 *   - `nextFrame({ type, timeoutMs })` which awaits the next frame matching
 *     `type` (or any frame if `type` is omitted), surfacing timeouts with a
 *     useful diagnostic instead of hanging forever.
 *
 * The client rejects `error` frames by default — tests assert the happy path
 * never sees them — but `allowErrors: true` is honoured for negative cases.
 *
 * Only used in `apps/server/test/*`. No production import path.
 */
import type { ServerMsg } from '@riskrask/shared';

export interface NextFrameOpts {
  /** Filter: only resolve when the next matching-type frame arrives. */
  readonly type?: ServerMsg['type'];
  /** Reject after this many ms with the current inbox as diagnostics. */
  readonly timeoutMs?: number;
}

export interface TestWsClient {
  readonly inbox: readonly ServerMsg[];
  readonly opened: Promise<void>;
  readonly closed: Promise<void>;
  nextFrame(opts?: NextFrameOpts): Promise<ServerMsg>;
  send(msg: unknown): void;
  close(): void;
}

/**
 * Connect a test WebSocket against `url`. Returns as soon as the socket is
 * constructed — await `.opened` before sending. Incoming frames are parsed as
 * JSON and kept on `inbox`; `nextFrame()` walks a cursor through the inbox
 * and waits for new frames when it catches up.
 */
export function connectTestWs(url: string): TestWsClient {
  const inbox: ServerMsg[] = [];
  const waiters: Array<{
    resolve: (m: ServerMsg) => void;
    reject: (err: Error) => void;
    match: (m: ServerMsg) => boolean;
  }> = [];

  const ws = new WebSocket(url);

  const opened = new Promise<void>((resolve, reject) => {
    ws.addEventListener('open', () => resolve());
    ws.addEventListener('error', () => reject(new Error(`ws error (url=${url})`)));
  });
  const closed = new Promise<void>((resolve) => {
    ws.addEventListener('close', () => resolve());
  });

  ws.addEventListener('message', (evt: MessageEvent) => {
    let frame: ServerMsg;
    try {
      frame = JSON.parse(typeof evt.data === 'string' ? evt.data : String(evt.data));
    } catch {
      return;
    }
    inbox.push(frame);
    // Deliver to the first waiter whose matcher accepts this frame.
    for (let i = 0; i < waiters.length; i++) {
      const w = waiters[i]!;
      if (w.match(frame)) {
        waiters.splice(i, 1);
        w.resolve(frame);
        return;
      }
    }
  });

  /**
   * `cursor` tracks how far into `inbox` we've already delivered to the
   * caller; when caller asks for the "next" frame, we first drain anything
   * already buffered before registering a waiter.
   */
  let cursor = 0;

  function nextFrame(opts: NextFrameOpts = {}): Promise<ServerMsg> {
    const { type, timeoutMs = 1_000 } = opts;
    const matcher = (m: ServerMsg) => (type === undefined ? true : m.type === type);

    // Drain any buffered frames at or past the cursor that satisfy the matcher.
    while (cursor < inbox.length) {
      const m = inbox[cursor]!;
      cursor++;
      if (matcher(m)) return Promise.resolve(m);
    }

    return new Promise<ServerMsg>((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = waiters.findIndex((w) => w.resolve === onResolve);
        if (idx >= 0) waiters.splice(idx, 1);
        reject(
          new Error(
            `nextFrame timed out after ${timeoutMs}ms waiting for ${
              type ?? 'any'
            } frame; inbox types so far: [${inbox.map((f) => f.type).join(', ')}]`,
          ),
        );
      }, timeoutMs);

      const onResolve = (m: ServerMsg) => {
        clearTimeout(timer);
        cursor = inbox.length;
        resolve(m);
      };

      waiters.push({ resolve: onResolve, reject, match: matcher });
    });
  }

  return {
    get inbox() {
      return inbox;
    },
    opened,
    closed,
    nextFrame,
    send(msg: unknown) {
      ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg));
    },
    close() {
      ws.close();
    },
  };
}
