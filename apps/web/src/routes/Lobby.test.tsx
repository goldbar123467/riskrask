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
                name: null,
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
    // Row falls back to code when name is null — code appears as the row label.
    expect(screen.getByTestId('room-row-label')).toHaveTextContent('ABCD23');
  });

  it('with no tab param fetches via the public endpoint', async () => {
    setToken('eyJtest');
    const stub = installFetchStub([
      {
        match: '/api/rooms?visibility=public&state=lobby',
        method: 'GET',
        body: { ok: true, data: { rooms: [] } },
      },
      {
        match: '/api/rooms/mine',
        method: 'GET',
        body: { ok: true, data: { rooms: [] } },
      },
    ]);
    renderAt('/lobby');
    await waitFor(() => {
      expect(
        stub.calls.some((c) => c.url.includes('/api/rooms?visibility=public&state=lobby')),
      ).toBe(true);
    });
    expect(stub.calls.some((c) => c.url.includes('/api/rooms/mine'))).toBe(false);
  });

  it('with ?tab=my fetches via listMyRooms (/rooms/mine)', async () => {
    setToken('eyJtest');
    const stub = installFetchStub([
      {
        match: '/api/rooms?visibility=public&state=lobby',
        method: 'GET',
        body: { ok: true, data: { rooms: [] } },
      },
      {
        match: '/api/rooms/mine',
        method: 'GET',
        body: {
          ok: true,
          data: {
            rooms: [
              {
                id: 'r-7',
                code: 'ZZZZ99',
                name: 'Friday Night',
                state: 'lobby',
                visibility: 'private',
                hostId: 'u-host',
                createdAt: '2026-04-22T00:00:00Z',
                seatCount: 1,
                mySeatIdx: 0,
              },
            ],
          },
        },
      },
    ]);
    renderAt('/lobby?tab=my');
    await waitFor(() => {
      expect(stub.calls.some((c) => c.url.includes('/api/rooms/mine'))).toBe(true);
    });
    // Name is surfaced as the primary row label; public endpoint untouched.
    await waitFor(() => {
      expect(screen.getByTestId('room-row-label')).toHaveTextContent('Friday Night');
    });
    expect(stub.calls.some((c) => c.url.includes('/api/rooms?visibility=public&state=lobby'))).toBe(
      false,
    );
  });

  it('empty My Rooms state nudges the user to create or join', async () => {
    setToken('eyJtest');
    installFetchStub([
      {
        match: '/api/rooms/mine',
        method: 'GET',
        body: { ok: true, data: { rooms: [] } },
      },
    ]);
    renderAt('/lobby?tab=my');
    await waitFor(() => {
      expect(screen.getByText(/no active rooms/i)).toBeInTheDocument();
    });
  });

  it('requires a non-empty name — submit is disabled until the input is filled', async () => {
    setToken('eyJtest');
    const stub = installFetchStub([
      {
        match: '/api/rooms?visibility=public&state=lobby',
        method: 'GET',
        body: { ok: true, data: { rooms: [] } },
      },
    ]);
    renderAt('/lobby');

    const user = userEvent.setup();
    await user.click(await screen.findByTestId('create-toggle'));

    const submit = screen.getByTestId('create-room-submit');
    expect(submit).toBeDisabled();

    const input = screen.getByTestId('room-name-input');
    await user.type(input, 'Friday');
    expect(submit).not.toBeDisabled();

    // Whitespace-only is treated as blank.
    await user.clear(input);
    await user.type(input, '   ');
    expect(submit).toBeDisabled();

    // No POST should have fired against /api/rooms while the form was invalid.
    const posts = stub.calls.filter(
      (c) => c.url.endsWith('/api/rooms') && (c.init?.method ?? 'GET').toUpperCase() === 'POST',
    );
    expect(posts.length).toBe(0);
  });

  it('includes name in the create-room POST when the input is filled', async () => {
    setToken('eyJtest');
    const stub = installFetchStub([
      {
        match: '/api/rooms?visibility=public&state=lobby',
        method: 'GET',
        body: { ok: true, data: { rooms: [] } },
      },
      {
        match: '/api/rooms',
        method: 'POST',
        body: {
          ok: true,
          data: {
            room: {
              id: 'r-new',
              code: 'NEWROOM',
              name: 'My Table',
              state: 'lobby',
            },
          },
        },
      },
    ]);
    renderAt('/lobby');

    const user = userEvent.setup();
    await user.click(await screen.findByTestId('create-toggle'));
    await user.type(screen.getByTestId('room-name-input'), '  My Table  ');
    await user.click(screen.getByTestId('create-room-submit'));

    await waitFor(() => {
      const posts = stub.calls.filter(
        (c) => c.url.endsWith('/api/rooms') && (c.init?.method ?? 'GET').toUpperCase() === 'POST',
      );
      expect(posts.length).toBeGreaterThan(0);
    });
    const post = stub.calls.find(
      (c) => c.url.endsWith('/api/rooms') && (c.init?.method ?? 'GET').toUpperCase() === 'POST',
    );
    const body = JSON.parse(String(post?.init?.body ?? '{}')) as Record<string, unknown>;
    // Trimmed before send.
    expect(body.name).toBe('My Table');
  });

  it('room row renders name when present and falls back to code when null', async () => {
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
                id: 'r-named',
                code: 'AAAA23',
                name: 'Weekend Warband',
                state: 'lobby',
                visibility: 'public',
                hostId: 'u-host',
                createdAt: '2026-04-22T00:00:00Z',
                seatCount: 3,
              },
              {
                id: 'r-unnamed',
                code: 'BBBB23',
                name: null,
                state: 'lobby',
                visibility: 'public',
                hostId: 'u-host',
                createdAt: '2026-04-22T00:00:00Z',
                seatCount: 1,
              },
            ],
          },
        },
      },
    ]);
    renderAt('/lobby');
    await waitFor(() => expect(screen.getByTestId('room-list')).toBeInTheDocument());
    const labels = screen.getAllByTestId('room-row-label').map((el) => el.textContent);
    expect(labels).toEqual(['Weekend Warband', 'BBBB23']);
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

  it('enables the launch button for a solo host (1 human, 0 AI)', async () => {
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
    // S4 relaxation: host can LAUNCH solo — AI autofills empty seats.
    expect(launch).not.toBeDisabled();
  });

  it('disables the launch button for an empty lobby (0 seats)', async () => {
    const userId = 'u-host';
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
              seats: [],
            },
            game: null,
          },
        },
      },
    ]);
    renderAt('/lobby/r-1');
    // No seats and the caller isn't in one → LAUNCH is invisible because the
    // host check requires at least a hostId match AND room.seats isn't the
    // gate — canLaunch still needs filledSeats >= 1.
    const launch = await screen.findByTestId('launch-btn');
    expect(launch).toBeDisabled();
  });

  it('renders (YOU) badge on the current-user seat and not on others', async () => {
    const meId = 'u-me';
    const hostId = 'u-host';
    setToken('aaa.eyJzdWIiOiJ1LW1lIn0.bbb');
    installFetchStub([
      { match: '/api/rooms?', method: 'GET', body: { ok: true, data: { rooms: [] } } },
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
                  displayName: 'Alice',
                },
                {
                  seatIdx: 1,
                  userId: meId,
                  isAi: false,
                  archId: null,
                  ready: false,
                  connected: true,
                  displayName: 'Me',
                },
              ],
            },
            game: null,
          },
        },
      },
    ]);
    renderAt('/lobby/r-1');
    const badges = await screen.findAllByTestId('seat-you-badge');
    expect(badges).toHaveLength(1);
    // The badge lives inside the `seat-row-me` <li>.
    const myRow = screen.getByTestId('seat-row-me');
    expect(myRow).toContainElement(badges[0]!);
    // Other seats: no (YOU) text.
    expect(screen.queryAllByText(/\(YOU\)/)).toHaveLength(1);
  });

  it('renders Seated as #N when the user holds a seat', async () => {
    const meId = 'u-me';
    setToken('aaa.eyJzdWIiOiJ1LW1lIn0.bbb');
    installFetchStub([
      { match: '/api/rooms?', method: 'GET', body: { ok: true, data: { rooms: [] } } },
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
              hostId: meId,
              maxPlayers: 4,
              seats: [
                {
                  seatIdx: 0,
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
    const seated = await screen.findByTestId('seated-as');
    expect(seated).toHaveTextContent('Seated as #0');
  });

  it('falls back to UUID slice for a human seat with no displayName', async () => {
    const meId = 'u-me';
    const other = '01234567-abcd-efab-cdef-000000000000';
    setToken('aaa.eyJzdWIiOiJ1LW1lIn0.bbb');
    installFetchStub([
      { match: '/api/rooms?', method: 'GET', body: { ok: true, data: { rooms: [] } } },
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
              hostId: meId,
              maxPlayers: 4,
              seats: [
                {
                  seatIdx: 0,
                  userId: meId,
                  isAi: false,
                  archId: null,
                  ready: true,
                  connected: true,
                  displayName: 'Me',
                },
                {
                  seatIdx: 1,
                  userId: other,
                  isAi: false,
                  archId: null,
                  ready: true,
                  connected: true,
                  displayName: null,
                },
              ],
            },
            game: null,
          },
        },
      },
    ]);
    renderAt('/lobby/r-1');
    // 'Me' renders for my seat (displayName present), first 8 of UUID for the other.
    expect(await screen.findByText('Me')).toBeInTheDocument();
    expect(screen.getByText(other.slice(0, 8))).toBeInTheDocument();
  });

  it('opens solo-copy ConfirmDialog when the only human clicks Leave', async () => {
    const meId = 'u-me';
    setToken('aaa.eyJzdWIiOiJ1LW1lIn0.bbb');
    installFetchStub([
      { match: '/api/rooms?', method: 'GET', body: { ok: true, data: { rooms: [] } } },
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
              hostId: meId,
              maxPlayers: 4,
              seats: [
                {
                  seatIdx: 0,
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
    const leave = await screen.findByTestId('leave-btn');
    const user = userEvent.setup();
    await user.click(leave);
    await waitFor(() => expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument());
    expect(screen.getByText('Close this lobby?')).toBeInTheDocument();
    expect(screen.getByTestId('confirm-dialog-confirm')).toHaveTextContent('Close lobby');
  });

  it('opens non-solo ConfirmDialog copy when ≥2 humans are seated', async () => {
    const meId = 'u-me';
    const hostId = 'u-host';
    setToken('aaa.eyJzdWIiOiJ1LW1lIn0.bbb');
    installFetchStub([
      { match: '/api/rooms?', method: 'GET', body: { ok: true, data: { rooms: [] } } },
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
    const leave = await screen.findByTestId('leave-btn');
    const user = userEvent.setup();
    await user.click(leave);
    await waitFor(() => expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument());
    expect(screen.getByText('Leave this room?')).toBeInTheDocument();
    expect(screen.getByTestId('confirm-dialog-confirm')).toHaveTextContent('Leave');
  });

  it('on confirm with roomDeleted=true → calls leave API and shows lobby-closed toast', async () => {
    const meId = 'u-me';
    setToken('aaa.eyJzdWIiOiJ1LW1lIn0.bbb');
    const stub = installFetchStub([
      { match: '/api/rooms?', method: 'GET', body: { ok: true, data: { rooms: [] } } },
      {
        match: '/api/rooms/r-1/leave',
        method: 'POST',
        body: { ok: true, data: { roomDeleted: true, newHostId: null } },
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
              hostId: meId,
              maxPlayers: 4,
              seats: [
                {
                  seatIdx: 0,
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
    const leave = await screen.findByTestId('leave-btn');
    const user = userEvent.setup();
    await user.click(leave);
    const confirm = await screen.findByTestId('confirm-dialog-confirm');
    await user.click(confirm);
    // POST /leave was called.
    await waitFor(() => {
      const leaveCalls = stub.calls.filter(
        (c) => c.url.includes('/leave') && (c.init?.method ?? 'GET').toUpperCase() === 'POST',
      );
      expect(leaveCalls.length).toBeGreaterThan(0);
    });
    // Toast renders the "Lobby closed" notice (auto-dismisses via a real
    // timer — we don't wait for the dismissal here, just that it fired).
    await waitFor(() => expect(screen.getByTestId('lobby-closed-toast')).toBeInTheDocument());
    expect(screen.getByTestId('lobby-closed-toast')).toHaveTextContent('Lobby closed');
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
