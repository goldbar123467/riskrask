/**
 * Tests for `useRoomDispatcher`.
 *
 * These exercise the hook against a mocked global `WebSocket`, asserting:
 *   - mounting opens a socket to the provided URL
 *   - a `welcome` frame loads state into the zustand store
 *   - an `applied` frame drives the local reducer via `dispatch`
 *   - unmount closes the socket
 */

import { type Action, createInitialState, playerId } from '@riskrask/engine';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ServerMsg } from '../net/protocol';
import { useGame } from './useGame';
import { useRoomDispatcher } from './useRoomDispatcher';

// ---------------------------------------------------------------------------
// MockWebSocket (mirrors the one in net/ws.test.ts — kept local to avoid
// building a test helpers barrel just for two files).
// ---------------------------------------------------------------------------

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
  readonly sent: string[] = [];

  constructor(url: string) {
    this.url = url;
    instances.push(this);
  }

  triggerOpen(): void {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.(new Event('open'));
  }

  deliver(msg: ServerMsg): void {
    this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(msg) }));
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

beforeEach(() => {
  instances.length = 0;
  vi.stubGlobal('WebSocket', MockWebSocket);
  // Clear the zustand store between tests.
  useGame.setState({
    state: null,
    selected: null,
    hoverTarget: null,
    effectsQueue: [],
    log: [],
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useRoomDispatcher', () => {
  it('opens a socket to the provided URL on mount', () => {
    const url = 'ws://test.local/api/ws/room-1?token=t&seat=0';
    renderHook(() => useRoomDispatcher({ roomId: 'room-1', seatIdx: 0, token: 't', url }));
    expect(instances.length).toBe(1);
    expect(instances[0]!.url).toBe(url);
  });

  it('welcome frame hydrates the game store', () => {
    const { result } = renderHook(() =>
      useRoomDispatcher({
        roomId: 'room-1',
        seatIdx: 0,
        token: 't',
        url: 'ws://t/ws',
      }),
    );

    const initial = createInitialState({
      seed: 'welcome-test',
      players: [
        { id: playerId('a'), name: 'A', color: '#f00', isAI: false },
        { id: playerId('b'), name: 'B', color: '#0f0', isAI: true },
      ],
    });

    const ws = instances[0]!;
    act(() => {
      ws.triggerOpen();
      ws.deliver({
        type: 'welcome',
        gameId: 'g1',
        seatIdx: 0,
        state: initial,
        seats: [
          { seatIdx: 0, userId: 'u1', isAi: false, archId: null, connected: true },
          { seatIdx: 1, userId: null, isAi: true, archId: 'dilettante', connected: true },
        ],
        hash: 'h-initial',
        seq: 0,
      });
    });

    expect(useGame.getState().state).not.toBeNull();
    expect(useGame.getState().state?.seed).toBe('welcome-test');
    expect(result.current.seats.length).toBe(2);
    expect(result.current.seq).toBe(0);
  });

  it('applied frame drives the local reducer via dispatch', () => {
    // The test uses a bogus `nextHash` so the hash-mismatch warning is
    // expected; silence it to keep output clean.
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    renderHook(() =>
      useRoomDispatcher({
        roomId: 'room-1',
        seatIdx: 0,
        token: 't',
        url: 'ws://t/ws',
      }),
    );

    // Seed the store with a fresh game, then feed an `applied` for a legal
    // setup action and verify the store advanced.
    const initial = createInitialState({
      seed: 'applied-test',
      players: [
        { id: playerId('a'), name: 'A', color: '#f00', isAI: false },
        { id: playerId('b'), name: 'B', color: '#0f0', isAI: false },
      ],
    });

    const ws = instances[0]!;
    act(() => {
      ws.triggerOpen();
      ws.deliver({
        type: 'welcome',
        gameId: 'g1',
        seatIdx: 0,
        state: initial,
        seats: [],
        hash: 'h0',
        seq: 0,
      });
    });

    const before = useGame.getState().state;
    expect(before).not.toBeNull();

    // Pick the first legal claim-territory target (territories is a Record).
    const firstUnclaimedEntry = Object.entries(before!.territories).find(
      ([, t]) => t.owner === null,
    );
    expect(firstUnclaimedEntry).toBeDefined();
    const firstName = firstUnclaimedEntry![0] as Action extends {
      type: 'claim-territory';
      territory: infer N;
    }
      ? N
      : never;

    const claim: Action = {
      type: 'claim-territory',
      territory: firstName,
    };

    act(() => {
      ws.deliver({
        type: 'applied',
        seq: 1,
        action: claim,
        nextHash: 'ignored-in-test',
        effects: [],
      });
    });

    const after = useGame.getState().state;
    expect(after).not.toBeNull();
    const updated = after!.territories[firstName];
    expect(updated?.owner).not.toBeNull();
    warnSpy.mockRestore();
  });

  it('flags terminalClose=true when the socket closes before welcome', () => {
    const { result } = renderHook(() =>
      useRoomDispatcher({
        roomId: 'room-1',
        seatIdx: 0,
        token: 't',
        url: 'ws://t/ws',
      }),
    );

    expect(result.current.terminalClose).toBe(false);

    // Open, then close with 1008 (policy-violation / auth reject) before
    // ever delivering a welcome. The hook must now flag the terminal state
    // so PlayRoom can surface an error instead of spinning forever.
    const ws = instances[0]!;
    act(() => {
      ws.triggerOpen();
      ws.close(1008);
    });

    expect(result.current.connState).toBe('closed');
    expect(result.current.terminalClose).toBe(true);
  });

  it('does not flag terminalClose when welcome arrives before close', () => {
    const { result } = renderHook(() =>
      useRoomDispatcher({
        roomId: 'room-1',
        seatIdx: 0,
        token: 't',
        url: 'ws://t/ws',
      }),
    );

    const initial = createInitialState({
      seed: 'terminal-guard',
      players: [
        { id: playerId('a'), name: 'A', color: '#f00', isAI: false },
        { id: playerId('b'), name: 'B', color: '#0f0', isAI: true },
      ],
    });

    const ws = instances[0]!;
    act(() => {
      ws.triggerOpen();
      ws.deliver({
        type: 'welcome',
        gameId: 'g1',
        seatIdx: 0,
        state: initial,
        seats: [],
        hash: 'h0',
        seq: 0,
      });
      ws.close(1000);
    });

    // Welcome was seen first — the subsequent close is NOT terminal from
    // the shell's perspective. Reconnect logic handles it.
    expect(result.current.terminalClose).toBe(false);
  });

  it('closes the socket on unmount', () => {
    const { unmount } = renderHook(() =>
      useRoomDispatcher({
        roomId: 'room-1',
        seatIdx: 0,
        token: 't',
        url: 'ws://t/ws',
      }),
    );

    const ws = instances[0]!;
    act(() => {
      ws.triggerOpen();
    });
    expect(ws.readyState).toBe(MockWebSocket.OPEN);

    unmount();

    expect(ws.readyState).toBe(MockWebSocket.CLOSED);
  });
});
