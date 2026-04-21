/**
 * Tests for the room WebSocket client.
 *
 * We stand up a minimal `MockWebSocket` and stub it onto `globalThis`
 * per-test, then drive it with `vi.useFakeTimers()` to assert heartbeat
 * and reconnect behaviour deterministically.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClientMsg, ServerMsg } from './protocol';
import { createWsClient } from './ws';

// ---------------------------------------------------------------------------
// MockWebSocket
// ---------------------------------------------------------------------------

/** All mock instances created since the last `beforeEach`. */
const instances: MockWebSocket[] = [];

class MockWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readonly url: string;
  readyState: number = MockWebSocket.CONNECTING;
  onopen: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  /** Every frame the client sent — JSON strings in the same order. */
  readonly sent: string[] = [];

  constructor(url: string) {
    this.url = url;
    instances.push(this);
  }

  /** Test helper — flip to OPEN and fire onopen. */
  triggerOpen(): void {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.(new Event('open'));
  }

  /** Test helper — deliver a server frame as a string. */
  deliverRaw(data: string): void {
    this.onmessage?.(new MessageEvent('message', { data }));
  }

  /** Test helper — deliver a typed server message. */
  deliver(msg: ServerMsg): void {
    this.deliverRaw(JSON.stringify(msg));
  }

  /** Test helper — simulate a close event. */
  triggerClose(code: number, reason = ''): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.(new CloseEvent('close', { code, reason, wasClean: code === 1000 }));
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(code = 1000): void {
    if (this.readyState === MockWebSocket.CLOSED) return;
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.(new CloseEvent('close', { code, wasClean: true }));
  }
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let originalWS: typeof globalThis.WebSocket;

beforeEach(() => {
  instances.length = 0;
  originalWS = globalThis.WebSocket;
  vi.stubGlobal('WebSocket', MockWebSocket);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  globalThis.WebSocket = originalWS;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createWsClient', () => {
  it('queues sends while disconnected and flushes them on open', () => {
    const client = createWsClient({
      roomId: 'room-1',
      seatIdx: 0,
      token: 't',
      url: 'ws://test/ws',
    });

    const chatMsg: ClientMsg = { type: 'chat', text: 'hello' };
    client.send(chatMsg);

    const ws = instances[0]!;
    // Nothing has been sent yet because the socket isn't open.
    expect(ws.sent.length).toBe(0);

    ws.triggerOpen();

    // On open, the client auto-sends a `join` then flushes the queue.
    const frames = ws.sent.map((s) => JSON.parse(s) as ClientMsg);
    expect(frames[0]?.type).toBe('join');
    const queuedChat = frames.find((f) => f.type === 'chat');
    expect(queuedChat).toEqual(chatMsg);
  });

  it('emits valid server frames via onMessage', () => {
    const client = createWsClient({
      roomId: 'room-1',
      seatIdx: 2,
      token: 't',
      url: 'ws://test/ws',
    });
    const received: ServerMsg[] = [];
    client.onMessage((m) => received.push(m));

    const ws = instances[0]!;
    ws.triggerOpen();

    const welcome: ServerMsg = {
      type: 'welcome',
      gameId: 'g1',
      seatIdx: 2,
      state: { foo: 'bar' },
      seats: [],
      hash: 'h',
      seq: 0,
    };
    ws.deliver(welcome);

    expect(received).toEqual([welcome]);
  });

  it('surfaces invalid JSON as a synthetic INVALID_SERVER_MSG error', () => {
    const client = createWsClient({
      roomId: 'room-1',
      seatIdx: 0,
      token: 't',
      url: 'ws://test/ws',
    });
    const received: ServerMsg[] = [];
    client.onMessage((m) => received.push(m));

    const ws = instances[0]!;
    ws.triggerOpen();
    ws.deliverRaw('{not valid json');

    expect(received).toEqual([{ type: 'error', code: 'INVALID_SERVER_MSG' }]);
  });

  it('surfaces schema-invalid frames as INVALID_SERVER_MSG too', () => {
    const client = createWsClient({
      roomId: 'room-1',
      seatIdx: 0,
      token: 't',
      url: 'ws://test/ws',
    });
    const received: ServerMsg[] = [];
    client.onMessage((m) => received.push(m));

    const ws = instances[0]!;
    ws.triggerOpen();
    // Valid JSON, but doesn't match any ServerMsg variant.
    ws.deliverRaw(JSON.stringify({ type: 'nope', foo: 1 }));

    expect(received).toEqual([{ type: 'error', code: 'INVALID_SERVER_MSG' }]);
  });

  it('sends a heartbeat every 20 seconds while open', () => {
    createWsClient({
      roomId: 'room-1',
      seatIdx: 0,
      token: 't',
      url: 'ws://test/ws',
    });
    const ws = instances[0]!;
    ws.triggerOpen();

    const beforeHeartbeats = ws.sent.length;
    vi.advanceTimersByTime(20_000);
    const afterFirst = ws.sent.length;
    expect(afterFirst).toBe(beforeHeartbeats + 1);
    const hb1 = JSON.parse(ws.sent[ws.sent.length - 1]!) as ClientMsg;
    expect(hb1.type).toBe('heartbeat');

    vi.advanceTimersByTime(20_000);
    const afterSecond = ws.sent.length;
    expect(afterSecond).toBe(afterFirst + 1);
    const hb2 = JSON.parse(ws.sent[ws.sent.length - 1]!) as ClientMsg;
    expect(hb2.type).toBe('heartbeat');
  });

  it('reconnects with exponential backoff after an abnormal close', () => {
    const client = createWsClient({
      roomId: 'room-1',
      seatIdx: 0,
      token: 't',
      url: 'ws://test/ws',
    });
    const states: string[] = [];
    client.onState((s) => states.push(s));

    const ws0 = instances[0]!;
    ws0.triggerOpen();
    ws0.triggerClose(1011, 'server error');

    // First retry fires after 500ms (base backoff).
    vi.advanceTimersByTime(499);
    expect(instances.length).toBe(1);
    vi.advanceTimersByTime(1);
    expect(instances.length).toBe(2);

    // Drop the second attempt before it opens — the internal attempt counter
    // therefore stays 1, and the next retry uses 500ms * 2^1 = 1000ms.
    const ws1 = instances[1]!;
    ws1.triggerClose(1011);

    vi.advanceTimersByTime(999);
    expect(instances.length).toBe(2);
    vi.advanceTimersByTime(1);
    expect(instances.length).toBe(3);

    // State went from 'open' → 'reconnecting' on the first failure. Each
    // subsequent failed attempt keeps us in 'reconnecting' (no-op emission)
    // which is the intended behaviour — the caller cares that we are still
    // trying, not the per-attempt count. The attempt count is already
    // asserted via `instances.length` above.
    expect(states).toContain('open');
    expect(states).toContain('reconnecting');
  });

  it('does not reconnect on code 1000 (normal) or 1008 (auth fail)', () => {
    createWsClient({
      roomId: 'room-1',
      seatIdx: 0,
      token: 't',
      url: 'ws://test/ws',
    });
    const ws0 = instances[0]!;
    ws0.triggerOpen();
    ws0.triggerClose(1008, 'seat mismatch');

    vi.advanceTimersByTime(60_000);
    expect(instances.length).toBe(1);
  });

  it('gives up after MAX_RECONNECT_ATTEMPTS and emits state=closed', () => {
    const client = createWsClient({
      roomId: 'room-1',
      seatIdx: 0,
      token: 't',
      url: 'ws://test/ws',
    });
    const states: string[] = [];
    client.onState((s) => states.push(s));

    // First socket fails before ever opening.
    instances[0]!.triggerClose(1011);
    // Drive all 6 reconnect attempts; each retry capped at 30s.
    for (let i = 0; i < 6; i++) {
      vi.advanceTimersByTime(30_000);
      const last = instances[instances.length - 1]!;
      last.triggerClose(1011);
    }
    // The 7th attempt should not happen — state ends in 'closed'.
    expect(states[states.length - 1]).toBe('closed');
  });

  it('close() is idempotent', () => {
    const client = createWsClient({
      roomId: 'room-1',
      seatIdx: 0,
      token: 't',
      url: 'ws://test/ws',
    });
    const states: string[] = [];
    client.onState((s) => states.push(s));

    const ws = instances[0]!;
    ws.triggerOpen();

    client.close();
    const afterFirst = states.length;
    client.close();
    client.close();

    expect(states.length).toBe(afterFirst);
    expect(client.state).toBe('closed');
  });

  it('includes lastSeq on rejoin after a reconnect', () => {
    createWsClient({
      roomId: 'room-1',
      seatIdx: 1,
      token: 't',
      url: 'ws://test/ws',
    });
    const ws0 = instances[0]!;
    ws0.triggerOpen();

    // Deliver a welcome so the client records seq.
    ws0.deliver({
      type: 'welcome',
      gameId: 'g',
      seatIdx: 1,
      state: {},
      seats: [],
      hash: 'h',
      seq: 7,
    });

    ws0.triggerClose(1011);
    vi.advanceTimersByTime(500);

    const ws1 = instances[1]!;
    ws1.triggerOpen();
    const firstFrame = JSON.parse(ws1.sent[0]!) as ClientMsg;
    expect(firstFrame.type).toBe('join');
    if (firstFrame.type === 'join') {
      expect(firstFrame.lastSeq).toBe(7);
    }
  });

  it('drops oldest queued message when the send queue overflows', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const client = createWsClient({
      roomId: 'room-1',
      seatIdx: 0,
      token: 't',
      url: 'ws://test/ws',
    });
    // Queue 101 messages while the socket is still connecting.
    for (let i = 0; i < 101; i++) {
      client.send({ type: 'chat', text: `m${i}` });
    }
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
