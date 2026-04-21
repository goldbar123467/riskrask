/**
 * Lobby route tests.
 *
 * These tests exercise the component's REST-glue behaviour with a minimal
 * `fetch` stub. We lean on `@testing-library/react` + the MemoryRouter so
 * `useNavigate` / `useParams` work inside the test harness without a full
 * app shell.
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Lobby } from './Lobby';

function setToken(t: string): void {
  window.localStorage.setItem('rr_token', t);
}

function clearStorage(): void {
  window.localStorage.clear();
}

interface FetchCall {
  url: string;
  init: RequestInit | undefined;
}

/**
 * Tiny scripted fetch stub. Matches on URL substring + method; returns the
 * scripted body. Unknown routes return 404 so we can assert on unexpected
 * calls.
 */
function installFetchStub(
  routes: { match: string; method?: string; body: unknown; status?: number }[],
): { calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  const impl = async (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const method = (init?.method ?? 'GET').toUpperCase();
    const urlStr = typeof url === 'string' ? url : url.toString();
    calls.push({ url: urlStr, init });
    const hit = routes.find(
      (r) =>
        urlStr.includes(r.match) && (r.method === undefined || r.method.toUpperCase() === method),
    );
    if (!hit) {
      return new Response(JSON.stringify({ ok: false, code: 'NOT_FOUND' }), { status: 404 });
    }
    return new Response(JSON.stringify(hit.body), { status: hit.status ?? 200 });
  };
  vi.stubGlobal('fetch', vi.fn(impl));
  return { calls };
}

function uninstallFetchStub(): void {
  vi.unstubAllGlobals();
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/lobby" element={<Lobby />} />
        <Route path="/lobby/:roomId" element={<Lobby />} />
        <Route path="/" element={<div>home</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Lobby', () => {
  beforeEach(() => {
    clearStorage();
  });
  afterEach(() => {
    uninstallFetchStub();
    clearStorage();
  });

  it('shows the sign-in panel when no token is stored', () => {
    renderAt('/lobby');
    expect(screen.getByTestId('token-input')).toBeInTheDocument();
    expect(screen.getByTestId('token-submit')).toBeInTheDocument();
  });

  it('renders the open-room list when a token is present', async () => {
    setToken('eyJtest');
    installFetchStub([
      {
        match: '/api/rooms?visibility=public&state=lobby',
        method: 'GET',
        body: {
          ok: true,
          data: {
            rooms: [
              {
                id: 'r-1',
                code: 'ABCD23',
                state: 'lobby',
                visibility: 'public',
                hostId: 'u-host',
                createdAt: '2026-04-21T00:00:00Z',
                seatCount: 2,
              },
            ],
          },
        },
      },
    ]);
    renderAt('/lobby');
    await waitFor(() => expect(screen.getByTestId('room-list')).toBeInTheDocument());
    expect(screen.getByText('ABCD23')).toBeInTheDocument();
  });

  it('rejects a malformed room code in the join form', async () => {
    setToken('eyJtest');
    installFetchStub([
      {
        match: '/api/rooms?',
        method: 'GET',
        body: { ok: true, data: { rooms: [] } },
      },
    ]);
    renderAt('/lobby');
    const input = await screen.findByTestId('join-code-input');
    const submit = screen.getByTestId('join-submit');
    const user = userEvent.setup();
    await user.type(input, 'ABC');
    await user.click(submit);
    await waitFor(() => expect(screen.getByTestId('join-error')).toBeInTheDocument());
  });

  it('disables the launch button when fewer than 2 seats are ready', async () => {
    setToken('eyJtest');
    const userId = 'u-host';
    // Minimal fake JWT whose `sub` claim the auth decoder can read. Payload:
    // {"sub":"u-host"} base64url = eyJzdWIiOiJ1LWhvc3QifQ (no padding)
    setToken('aaa.eyJzdWIiOiJ1LWhvc3QifQ.bbb');
    installFetchStub([
      {
        match: '/api/rooms?',
        method: 'GET',
        body: { ok: true, data: { rooms: [] } },
      },
      {
        match: '/api/rooms/r-1',
        method: 'GET',
        body: {
          ok: true,
          data: {
            room: {
              id: 'r-1',
              code: 'ABCD23',
              state: 'lobby',
              visibility: 'public',
              hostId: userId,
              maxPlayers: 4,
              seats: [
                { seatIdx: 0, userId, isAi: false, archId: null, ready: false, connected: true },
              ],
            },
            game: null,
          },
        },
      },
    ]);
    renderAt('/lobby/r-1');
    const launch = await screen.findByTestId('launch-btn');
    expect(launch).toBeDisabled();
  });

  it("toggles a non-host seat's ready state via setReady", async () => {
    const hostId = 'u-host';
    const meId = 'u-me';
    // Payload {"sub":"u-me"} → eyJzdWIiOiJ1LW1lIn0
    setToken('aaa.eyJzdWIiOiJ1LW1lIn0.bbb');
    const stub = installFetchStub([
      {
        match: '/api/rooms?',
        method: 'GET',
        body: { ok: true, data: { rooms: [] } },
      },
      {
        match: '/api/rooms/r-1/ready',
        method: 'POST',
        body: { ok: true, data: {} },
      },
      {
        match: '/api/rooms/r-1',
        method: 'GET',
        body: {
          ok: true,
          data: {
            room: {
              id: 'r-1',
              code: 'ABCD23',
              state: 'lobby',
              visibility: 'public',
              hostId,
              maxPlayers: 4,
              seats: [
                {
                  seatIdx: 0,
                  userId: hostId,
                  isAi: false,
                  archId: null,
                  ready: true,
                  connected: true,
                },
                {
                  seatIdx: 1,
                  userId: meId,
                  isAi: false,
                  archId: null,
                  ready: false,
                  connected: true,
                },
              ],
            },
            game: null,
          },
        },
      },
    ]);
    renderAt('/lobby/r-1');
    const toggle = await screen.findByTestId('ready-toggle');
    const user = userEvent.setup();
    await user.click(toggle);
    await waitFor(() => {
      const readyCalls = stub.calls.filter(
        (c) => c.url.includes('/ready') && (c.init?.method ?? 'GET').toUpperCase() === 'POST',
      );
      expect(readyCalls.length).toBeGreaterThan(0);
    });
  });
});
