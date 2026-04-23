/**
 * PlayRoom route tests.
 *
 * These exercise the S3 additions:
 *   1. `game_over` frame → VictoryModal renders, navigate('/lobby') after 3s.
 *   2. Reconnect fallback: `getRoom` returns state='finished' → immediate
 *      redirect to /lobby.
 *
 * The inner component mounts heavy scene / stage deps that are irrelevant
 * for the assertions here. We mock `useRoomDispatcher` at the module level
 * so we can drive the hook directly via a captured `onGameOver` callback,
 * and we swap `Stage` / `Dossier` / etc for lightweight stubs.
 */

import type { GameState } from '@riskrask/engine';
import { createInitialState } from '@riskrask/engine';
import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useGame } from '../game/useGame';
import type { GameOverPayload } from '../game/useRoomDispatcher';
import type { Auth } from '../net/auth';

// ---------------------------------------------------------------------------
// Shared mock surface: useRoomDispatcher + getRoom + heavy UI.
// The `dispatcherMock` object is mutated per-test so each case can drive
// the hook via captured callbacks.
// ---------------------------------------------------------------------------

interface DispatcherMock {
  onTurnDeadline: ((d: number | null) => void) | null;
  onGameOver: ((p: GameOverPayload) => void) | null;
}
const dispatcherMock: DispatcherMock = { onTurnDeadline: null, onGameOver: null };

vi.mock('../game/useRoomDispatcher', async () => {
  const actual = await vi.importActual<typeof import('../game/useRoomDispatcher')>(
    '../game/useRoomDispatcher',
  );
  return {
    ...actual,
    useRoomDispatcher: vi.fn((opts: { onGameOver?: unknown; onTurnDeadline?: unknown }) => {
      dispatcherMock.onGameOver = (opts.onGameOver as DispatcherMock['onGameOver']) ?? null;
      dispatcherMock.onTurnDeadline =
        (opts.onTurnDeadline as DispatcherMock['onTurnDeadline']) ?? null;
      return {
        connState: 'open' as const,
        seq: 0,
        seats: [],
        sendIntent: () => {},
        sendChat: () => {},
        lastError: null,
        terminalClose: false,
      };
    }),
  };
});

const getRoomMock = vi.fn();
vi.mock('../net/api', async () => {
  const actual = await vi.importActual<typeof import('../net/api')>('../net/api');
  return { ...actual, getRoom: (...args: unknown[]) => getRoomMock(...args) };
});

// ---------------------------------------------------------------------------
// useAuth override — default path delegates to the real hook so existing
// setLegacyToken()-based tests keep working. Individual tests can plug
// their own implementation via `authOverride.impl = () => ({...})` to
// simulate Supabase hydration races.
// ---------------------------------------------------------------------------

const authOverride: { impl: (() => Auth) | null } = { impl: null };

vi.mock('../net/auth', async () => {
  const actual = await vi.importActual<typeof import('../net/auth')>('../net/auth');
  return {
    ...actual,
    useAuth: () => {
      if (authOverride.impl) return authOverride.impl();
      return actual.useAuth();
    },
  };
});

// Stubs for the big visual primitives. They don't need to do anything;
// we just need the component tree to render in jsdom without blowing up.
vi.mock('../stage/Stage', () => ({
  Stage: () => <div data-testid="stage-stub" />,
}));
vi.mock('../dossier/Dossier', () => ({
  Dossier: () => <div data-testid="dossier-stub" />,
}));
vi.mock('../console/ResponsiveShell', () => ({
  ResponsiveShell: ({
    topbar,
    stage,
  }: {
    topbar: React.ReactNode;
    stage: React.ReactNode;
  }) => (
    <div>
      <div data-testid="topbar">{topbar}</div>
      <div>{stage}</div>
    </div>
  ),
}));
vi.mock('../console/Topbar', () => ({
  Topbar: ({ clock }: { clock: string }) => <span data-testid="clock">{clock}</span>,
}));
vi.mock('../console/Statusbar', () => ({ Statusbar: () => null }));
vi.mock('../console/Brand', () => ({ Brand: () => null }));
vi.mock('../console/Rail', () => ({ Rail: () => null }));

// Keep VictoryModal real — we assert its presence via aria-label="victory-modal".

import { PlayRoom } from './PlayRoom';

function setLegacyToken(): void {
  // Payload {"sub":"u-me"} → eyJzdWIiOiJ1LW1lIn0 base64url.
  window.localStorage.setItem('rr_token', 'aaa.eyJzdWIiOiJ1LW1lIn0.bbb');
}

function renderPlayRoom(roomId = 'r-1') {
  return render(
    <MemoryRouter initialEntries={[`/play/${roomId}`]}>
      <Routes>
        <Route path="/play/:id" element={<PlayRoom roomId={roomId} />} />
        <Route path="/lobby" element={<div data-testid="lobby-landing">lobby</div>} />
        <Route
          path="/lobby/:roomId"
          element={<div data-testid="lobby-for-room">lobby-for-room</div>}
        />
      </Routes>
    </MemoryRouter>,
  );
}

// Build a valid, fully-hydrated engine state so the Inner component renders
// past the `if (!state) return null;` guard.
function seedGameStore(): GameState {
  const s = createInitialState({
    seed: 'playroom-test',
    players: [
      { id: '0', name: 'Alice', color: '#f00', isAI: false },
      { id: '1', name: 'Bob', color: '#00f', isAI: true },
    ],
  });
  useGame.setState({ state: s, selected: null, hoverTarget: null, effectsQueue: [], log: [] });
  return s;
}

function resetGameStore(): void {
  useGame.setState({ state: null, selected: null, hoverTarget: null, effectsQueue: [], log: [] });
}

beforeEach(() => {
  window.localStorage.clear();
  resetGameStore();
  dispatcherMock.onGameOver = null;
  dispatcherMock.onTurnDeadline = null;
  getRoomMock.mockReset();
  authOverride.impl = null;
});

afterEach(() => {
  vi.useRealTimers();
  window.localStorage.clear();
  resetGameStore();
});

describe('PlayRoom — game_over auto-redirect', () => {
  it('navigates to /lobby 3 seconds after game_over', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    setLegacyToken();
    seedGameStore();

    getRoomMock.mockResolvedValue({
      ok: true,
      data: {
        room: {
          id: 'r-1',
          code: 'ABCD23',
          state: 'active',
          hostId: 'u-me',
          maxPlayers: 2,
          seats: [
            { seatIdx: 0, userId: 'u-me', isAi: false, archId: null, ready: true, connected: true },
            {
              seatIdx: 1,
              userId: null,
              isAi: true,
              archId: 'dilettante',
              ready: true,
              connected: true,
            },
          ],
        },
        game: null,
      },
    });

    renderPlayRoom();

    // Wait for the inner component to mount (dispatcher callbacks registered).
    await waitFor(() => expect(dispatcherMock.onGameOver).not.toBeNull());

    // Drive the victory — set the store winner so VictoryModal renders,
    // then fire the dispatcher's onGameOver hook.
    await act(async () => {
      const s0 = useGame.getState().state!;
      useGame.setState({
        state: { ...s0, phase: 'done', winner: '1' as never },
      });
      dispatcherMock.onGameOver?.({
        winnerPlayerId: '1',
        winnerSeatIdx: 1,
        winnerUserId: null,
        winnerDisplay: 'Bob',
        finalHash: 'h-final',
        finalSeq: 42,
      });
    });

    // VictoryModal appears (aria-label="victory-modal").
    expect(await screen.findByLabelText('victory-modal')).toBeInTheDocument();

    // Fast-forward 3s — the redirect fires.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });

    await waitFor(() => expect(screen.getByTestId('lobby-landing')).toBeInTheDocument());
  });
});

describe('PlayRoom — auth hydration race', () => {
  it('does not redirect to /lobby/:roomId while auth is hydrating', async () => {
    // First render: Supabase is async-loading the session — hydrating=true,
    // token/userId still null. Under the old code PlayRoom's resolver fires
    // with nulls, sets resolution→redirect, and unmounts us.
    let hydrating = true;
    let token: string | null = null;
    let userId: string | null = null;

    authOverride.impl = (): Auth => ({
      token,
      userId,
      email: null,
      displayName: null,
      hydrating,
      setToken: () => {},
      clearToken: () => {},
      setDisplayName: () => {},
    });

    getRoomMock.mockResolvedValue({
      ok: true,
      data: {
        room: {
          id: 'r-1',
          code: 'ABCD23',
          state: 'active',
          hostId: 'u-me',
          maxPlayers: 2,
          seats: [
            { seatIdx: 0, userId: 'u-me', isAi: false, archId: null, ready: true, connected: true },
            {
              seatIdx: 1,
              userId: null,
              isAi: true,
              archId: 'dilettante',
              ready: true,
              connected: true,
            },
          ],
        },
        game: null,
      },
    });

    const { rerender } = renderPlayRoom();

    // We should NOT have bounced to the lobby route during the hydrating
    // window. The "lobby-for-room" element would only mount if PlayRoom's
    // resolver effect had prematurely fired the redirect path.
    expect(screen.queryByTestId('lobby-for-room')).toBeNull();
    expect(screen.queryByTestId('lobby-landing')).toBeNull();

    // Now simulate Supabase finishing hydration with a real session. The
    // auth mock flips, rerender kicks the hook, the resolver re-runs and
    // walks the happy path into `ready`.
    await act(async () => {
      hydrating = false;
      token = 'aaa.eyJzdWIiOiJ1LW1lIn0.bbb';
      userId = 'u-me';
      seedGameStore();
      rerender(
        <MemoryRouter initialEntries={['/play/r-1']}>
          <Routes>
            <Route path="/play/:id" element={<PlayRoom roomId="r-1" />} />
            <Route path="/lobby" element={<div data-testid="lobby-landing">lobby</div>} />
            <Route
              path="/lobby/:roomId"
              element={<div data-testid="lobby-for-room">lobby-for-room</div>}
            />
          </Routes>
        </MemoryRouter>,
      );
    });

    // Inner dispatcher mounts — means the happy path ran instead of a redirect.
    await act(async () => {
      await waitFor(() => expect(dispatcherMock.onGameOver).not.toBeNull());
    });
    // And we're still not on a lobby route.
    expect(screen.queryByTestId('lobby-for-room')).toBeNull();
    expect(screen.queryByTestId('lobby-landing')).toBeNull();
  });
});

describe('PlayRoom — reconnect with state=finished', () => {
  it('immediately redirects to /lobby when getRoom returns a finished room', async () => {
    setLegacyToken();

    getRoomMock.mockResolvedValue({
      ok: true,
      data: {
        room: {
          id: 'r-1',
          code: 'ABCD23',
          state: 'finished',
          hostId: 'u-other',
          maxPlayers: 2,
          seats: [
            { seatIdx: 0, userId: 'u-me', isAi: false, archId: null, ready: true, connected: true },
          ],
        },
        game: null,
      },
    });

    renderPlayRoom();

    await waitFor(() => expect(screen.getByTestId('lobby-landing')).toBeInTheDocument());
    // Dispatcher never mounted because the resolver returned before
    // reaching `ready`.
    expect(dispatcherMock.onGameOver).toBeNull();
  });
});
