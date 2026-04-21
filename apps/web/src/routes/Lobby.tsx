/**
 * Multiplayer lobby route.
 *
 * `/lobby`            — full-width public-room list + create/join form.
 * `/lobby/:roomId`    — split view: list on the left, active room on the
 *                       right with seats, ready/launch controls.
 *
 * State lives in local component state + polling. We intentionally do NOT
 * write to the zustand game store from here — the game store is only
 * populated once a WS `welcome` frame lands inside `/play/:roomId`. Zod
 * validation for WS frames lives in `net/ws.ts`; this route only touches
 * REST.
 */

import { ROOM_CODE_RE } from '@riskrask/shared';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AuthPanel } from '../auth/AuthPanel';
import {
  type CreateRoomBody,
  type RoomDetail,
  type RoomSeat,
  type RoomSummary,
  addAiSeat,
  createRoom,
  getRoom,
  joinRoom,
  launchRoom,
  leaveRoom,
  listPublicRooms,
  setReady,
} from '../net/api';
import { useAuth } from '../net/auth';

const ROOM_LIST_POLL_MS = 5000;
const ROOM_DETAIL_POLL_MS = 3000;
const AI_ARCHETYPES: readonly { id: string; label: string; tag: string }[] = [
  { id: 'dilettante', label: 'The Dilettante', tag: 'unpredictable opener' },
  { id: 'napoleon', label: 'Bonaparte', tag: 'aggressive expansion' },
  { id: 'fortress', label: 'The Fortress', tag: 'turtle, slow burn' },
  { id: 'jackal', label: 'The Jackal', tag: 'opportunistic eliminator' },
  { id: 'vengeful', label: 'The Tsar', tag: 'remembers grudges' },
  { id: 'patient', label: 'The Patriarch', tag: 'late-game closer' },
  { id: 'shogun', label: 'The Shogun', tag: 'disciplined sweeps' },
  { id: 'hermit', label: 'The Hermit', tag: 'isolationist' },
  { id: 'prophet', label: 'The Prophet', tag: 'zealous all-in' },
];

export function Lobby() {
  const { roomId } = useParams<{ roomId?: string }>();
  const navigate = useNavigate();
  const { token, userId, email, setToken, clearToken } = useAuth();

  if (!token) {
    return <AuthPanel onLegacyToken={setToken} />;
  }

  return (
    <main className="flex h-full min-h-screen flex-col bg-bg-0 px-4 py-6 lg:px-8">
      <LobbyHeader onSignOut={clearToken} userId={userId} email={email} />

      <div className="mt-6 grid flex-1 gap-6 lg:grid-cols-[1fr_minmax(320px,420px)]">
        <section className="flex flex-col gap-4">
          <RoomListPanel token={token} activeRoomId={roomId ?? null} />
        </section>

        <section className="flex flex-col gap-4">
          {roomId ? (
            <ActiveRoomPanel
              key={roomId}
              roomId={roomId}
              token={token}
              userId={userId}
              onLeave={() => void navigate('/lobby')}
              onLaunch={() => void navigate(`/play/${roomId}`)}
            />
          ) : (
            <EmptyRoomPlaceholder />
          )}
        </section>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

function LobbyHeader({
  onSignOut,
  userId,
  email,
}: {
  onSignOut: () => void;
  userId: string | null;
  email: string | null;
}) {
  const navigate = useNavigate();
  const label = email ?? (userId ? `${userId.slice(0, 8)}…` : null);
  return (
    <header className="flex items-center justify-between border-b border-line pb-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void navigate('/')}
          className="border border-line px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-ink-faint hover:border-line-2 hover:text-ink-dim"
        >
          ← Home
        </button>
        <h1 className="font-display text-sm tracking-[0.36em] text-ink">RISKRASK · LOBBY</h1>
      </div>
      <div className="flex items-center gap-3">
        {label && (
          <span
            className="font-mono text-[9px] uppercase tracking-[0.16em] text-ink-ghost"
            title={userId ?? undefined}
            data-testid="auth-identity"
          >
            {label}
          </span>
        )}
        <button
          type="button"
          onClick={onSignOut}
          data-testid="sign-out"
          className="border border-line px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-ink-faint hover:border-line-2 hover:text-ink-dim"
        >
          Sign out
        </button>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Left panel — public-room list + create / join by code
// ---------------------------------------------------------------------------

interface RoomListPanelProps {
  token: string;
  activeRoomId: string | null;
}

function RoomListPanel({ token, activeRoomId }: RoomListPanelProps) {
  const navigate = useNavigate();
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createBusy, setCreateBusy] = useState(false);

  const refresh = useCallback(async () => {
    const result = await listPublicRooms(token);
    if (result.ok) {
      setRooms(result.data.rooms);
      setListError(null);
    } else {
      setListError(result.detail ?? result.code);
    }
  }, [token]);

  useEffect(() => {
    void refresh();
    const handle = setInterval(() => {
      void refresh();
    }, ROOM_LIST_POLL_MS);
    return () => {
      clearInterval(handle);
    };
  }, [refresh]);

  async function handleCreate(body: CreateRoomBody) {
    setCreateBusy(true);
    setCreateError(null);
    const result = await createRoom(body, token);
    setCreateBusy(false);
    if (!result.ok) {
      setCreateError(result.detail ?? result.code);
      return;
    }
    setCreateOpen(false);
    void navigate(`/lobby/${result.data.room.id}`);
  }

  async function handleJoinByCode(e: FormEvent) {
    e.preventDefault();
    const code = joinCode.trim().toUpperCase();
    if (!ROOM_CODE_RE.test(code)) {
      setJoinError('Codes are 6 uppercase characters (2-9, A-Z minus I/L/O).');
      return;
    }
    setJoinError(null);
    const result = await joinRoom(code, token);
    if (!result.ok) {
      setJoinError(result.detail ?? result.code);
      return;
    }
    setJoinCode('');
    void navigate(`/lobby/${result.data.room.id}`);
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <h2 className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-ghost">
          Open Rooms
        </h2>
        <button
          type="button"
          data-testid="create-toggle"
          onClick={() => setCreateOpen((v) => !v)}
          className="border border-hot bg-hot/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-hot hover:bg-hot/20"
        >
          {createOpen ? 'Cancel' : '+ Create room'}
        </button>
      </div>

      {createOpen && (
        <CreateRoomForm onSubmit={handleCreate} busy={createBusy} error={createError} />
      )}

      <form
        onSubmit={(e) => void handleJoinByCode(e)}
        className="flex flex-col gap-2 border border-line bg-panel p-3"
      >
        <label
          htmlFor="rr-join-code"
          className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink-ghost"
        >
          Join by code
        </label>
        <div className="flex gap-2">
          <input
            id="rr-join-code"
            data-testid="join-code-input"
            type="text"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            placeholder="ABCD23"
            maxLength={6}
            className="flex-1 border border-line bg-bg-0 px-3 py-2 font-mono text-sm uppercase tracking-[0.2em] text-ink placeholder:text-ink-ghost focus:border-hot focus:outline-none"
          />
          <button
            type="submit"
            data-testid="join-submit"
            className="border border-line px-4 font-mono text-[10px] uppercase tracking-widest text-ink-faint hover:border-line-2 hover:text-ink-dim"
          >
            Join
          </button>
        </div>
        {joinError && (
          <p data-testid="join-error" className="font-mono text-[9px] text-danger">
            {joinError}
          </p>
        )}
      </form>

      <div className="flex flex-col border border-line bg-panel">
        {listError && (
          <p className="border-b border-line px-3 py-2 font-mono text-[9px] text-danger">
            {listError}
          </p>
        )}
        {rooms.length === 0 && !listError ? (
          <p className="px-3 py-4 font-mono text-[10px] uppercase tracking-widest text-ink-ghost">
            No open rooms yet. Create one to get started.
          </p>
        ) : (
          <ul data-testid="room-list" className="divide-y divide-line">
            {rooms.map((r) => (
              <li
                key={r.id}
                className={`flex items-center justify-between px-3 py-2 ${
                  activeRoomId === r.id ? 'bg-hot/5' : ''
                }`}
              >
                <div className="flex flex-col gap-0.5">
                  <span className="font-mono text-sm tracking-[0.2em] text-ink">{r.code}</span>
                  <span className="font-mono text-[9px] uppercase tracking-widest text-ink-faint">
                    {r.state} · {r.seatCount} seat{r.seatCount === 1 ? '' : 's'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => void navigate(`/lobby/${r.id}`)}
                  className="border border-line px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-ink-faint hover:border-hot hover:text-hot"
                >
                  Open
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function CreateRoomForm({
  onSubmit,
  busy,
  error,
}: {
  onSubmit: (body: CreateRoomBody) => void;
  busy: boolean;
  error: string | null;
}) {
  const [visibility, setVisibility] = useState<'public' | 'private'>('public');
  const [maxPlayers, setMaxPlayers] = useState(6);

  function handle(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    onSubmit({ visibility, maxPlayers });
  }

  return (
    <form
      data-testid="create-room-form"
      onSubmit={handle}
      className="flex flex-col gap-3 border border-line bg-panel p-3"
    >
      <div className="flex flex-col gap-1.5">
        <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink-ghost">
          Visibility
        </span>
        <div className="flex gap-2">
          {(['public', 'private'] as const).map((v) => (
            <label
              key={v}
              className={`flex-1 cursor-pointer border py-1.5 text-center font-mono text-[10px] uppercase tracking-widest ${
                visibility === v
                  ? 'border-hot bg-hot/10 text-hot'
                  : 'border-line text-ink-faint hover:border-line-2 hover:text-ink-dim'
              }`}
            >
              <input
                type="radio"
                name="visibility"
                value={v}
                checked={visibility === v}
                onChange={() => setVisibility(v)}
                className="sr-only"
              />
              {v}
            </label>
          ))}
        </div>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink-ghost">
          Max players
        </span>
        <select
          data-testid="max-players-select"
          value={maxPlayers}
          onChange={(e) => setMaxPlayers(Number.parseInt(e.target.value, 10))}
          className="border border-line bg-bg-0 px-3 py-2 font-mono text-sm text-ink focus:border-hot focus:outline-none"
        >
          {[2, 3, 4, 5, 6].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>

      <button
        type="submit"
        data-testid="create-room-submit"
        disabled={busy}
        className="border border-hot bg-hot/10 py-2 font-mono text-[10px] uppercase tracking-widest text-hot hover:bg-hot/20 disabled:opacity-50"
      >
        {busy ? 'Creating…' : 'Create room'}
      </button>
      {error && (
        <p data-testid="create-error" className="font-mono text-[9px] text-danger">
          {error}
        </p>
      )}
    </form>
  );
}

// ---------------------------------------------------------------------------
// Right panel — active room detail
// ---------------------------------------------------------------------------

interface ActiveRoomPanelProps {
  roomId: string;
  token: string;
  userId: string | null;
  onLeave: () => void;
  onLaunch: () => void;
}

function ActiveRoomPanel({ roomId, token, userId, onLeave, onLaunch }: ActiveRoomPanelProps) {
  const [room, setRoom] = useState<RoomDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const result = await getRoom(roomId, token);
    if (result.ok) {
      setRoom(result.data.room);
      setLoadError(null);
    } else {
      setLoadError(result.detail ?? result.code);
    }
  }, [roomId, token]);

  useEffect(() => {
    void refresh();
    const handle = setInterval(() => {
      void refresh();
    }, ROOM_DETAIL_POLL_MS);
    return () => {
      clearInterval(handle);
    };
  }, [refresh]);

  // Stop polling once active — keep the last snapshot visible, then let the
  // host press launch to navigate.
  useEffect(() => {
    if (room?.state === 'active') {
      // Let the host trigger navigation manually; non-hosts see the snapshot
      // and can press "Open in play" below. No automatic navigation here.
    }
  }, [room?.state]);

  if (loadError) {
    return (
      <div className="flex flex-col gap-3 border border-line bg-panel p-4">
        <h2 className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-ghost">Room</h2>
        <p className="font-mono text-[10px] text-danger">{loadError}</p>
        <button
          type="button"
          onClick={onLeave}
          className="border border-line px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-ink-faint hover:border-line-2 hover:text-ink-dim"
        >
          Back to list
        </button>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="flex flex-col gap-3 border border-line bg-panel p-4">
        <h2 className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-ghost">Room</h2>
        <p className="font-mono text-[10px] uppercase tracking-widest text-ink-ghost">Loading…</p>
      </div>
    );
  }

  const seats: RoomSeat[] = room.seats ?? [];
  const isHost = room.hostId !== undefined && userId !== null && room.hostId === userId;
  const mySeat = seats.find((s) => s.userId !== null && s.userId === userId) ?? null;
  const filledSeats = seats.length;
  const allReady = seats.length > 0 && seats.every((s) => s.isAi || s.ready);
  const canLaunch = isHost && filledSeats >= 2 && allReady && room.state === 'lobby';

  async function handleReadyToggle() {
    if (!mySeat) return;
    setActionError(null);
    const result = await setReady(roomId, !mySeat.ready, token);
    if (!result.ok) {
      setActionError(result.detail ?? result.code);
      return;
    }
    void refresh();
  }

  async function handleLeave() {
    setActionError(null);
    const result = await leaveRoom(roomId, token);
    if (!result.ok) {
      setActionError(result.detail ?? result.code);
      return;
    }
    onLeave();
  }

  async function handleLaunch() {
    setActionError(null);
    const result = await launchRoom(roomId, token);
    if (!result.ok) {
      setActionError(result.detail ?? result.code);
      return;
    }
    onLaunch();
  }

  async function handleAddAi(archId: string) {
    setActionError(null);
    const result = await addAiSeat(roomId, archId, token);
    if (!result.ok) {
      setActionError(result.detail ?? result.code);
      return;
    }
    void refresh();
  }

  return (
    <div className="flex flex-col gap-4 border border-line bg-panel p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink-ghost">
            Room code
          </span>
          <div className="flex items-center gap-2">
            <span data-testid="room-code" className="font-mono text-2xl tracking-[0.28em] text-ink">
              {room.code}
            </span>
            <button
              type="button"
              onClick={() => {
                if (typeof navigator !== 'undefined' && navigator.clipboard) {
                  void navigator.clipboard.writeText(room.code);
                }
              }}
              className="border border-line px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest text-ink-faint hover:border-line-2 hover:text-ink-dim"
            >
              Copy
            </button>
          </div>
          <span className="font-mono text-[9px] uppercase tracking-widest text-ink-faint">
            {room.state} · {filledSeats}/{room.maxPlayers ?? 6} seats
          </span>
        </div>
        {room.state === 'active' && (
          <button
            type="button"
            data-testid="open-play"
            onClick={onLaunch}
            className="border border-hot bg-hot/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-hot hover:bg-hot/20"
          >
            Open in play
          </button>
        )}
      </div>

      <ul
        data-testid="seat-list"
        className="flex flex-col divide-y divide-line border-y border-line"
      >
        {seats.length === 0 ? (
          <li className="px-1 py-2 font-mono text-[10px] uppercase tracking-widest text-ink-ghost">
            Waiting for seats…
          </li>
        ) : (
          seats.map((seat) => <SeatRow key={seat.seatIdx} seat={seat} />)
        )}
      </ul>

      <div className="flex flex-col gap-2">
        {mySeat && !isHost && (
          <button
            type="button"
            data-testid="ready-toggle"
            onClick={() => void handleReadyToggle()}
            className={`border py-2 font-mono text-[10px] uppercase tracking-widest ${
              mySeat.ready
                ? 'border-hot bg-hot/10 text-hot hover:bg-hot/20'
                : 'border-line text-ink-faint hover:border-line-2 hover:text-ink-dim'
            }`}
          >
            {mySeat.ready ? 'Ready ✓' : 'Not ready'}
          </button>
        )}

        {isHost && (
          <>
            <AddAiControl onAdd={(id) => void handleAddAi(id)} />
            <button
              type="button"
              data-testid="launch-btn"
              onClick={() => void handleLaunch()}
              disabled={!canLaunch}
              className="border border-hot bg-hot/10 py-2 font-display tracking-[0.2em] text-hot hover:bg-hot/20 disabled:opacity-40"
            >
              LAUNCH
            </button>
            {!canLaunch && room.state === 'lobby' && (
              <p className="font-mono text-[9px] uppercase tracking-widest text-ink-ghost">
                Need 2+ seats with every human ready.
              </p>
            )}
          </>
        )}

        <button
          type="button"
          data-testid="leave-btn"
          onClick={() => void handleLeave()}
          className="border border-line py-2 font-mono text-[10px] uppercase tracking-widest text-ink-faint hover:border-line-2 hover:text-ink-dim"
        >
          Leave room
        </button>
        {actionError && (
          <p data-testid="action-error" className="font-mono text-[9px] text-danger">
            {actionError}
          </p>
        )}
      </div>
    </div>
  );
}

function SeatRow({ seat }: { seat: RoomSeat }) {
  const name = seat.isAi
    ? `AI · ${seat.archId ?? 'archetype'}`
    : (seat.displayName ?? (seat.userId ? seat.userId.slice(0, 8) : `Seat ${seat.seatIdx}`));
  return (
    <li className="flex items-center justify-between py-2">
      <div className="flex items-center gap-3">
        <span className="font-mono text-[9px] uppercase tracking-widest text-ink-ghost">
          #{seat.seatIdx}
        </span>
        <span className="font-display text-sm text-ink">{name}</span>
        {seat.isAi && (
          <span className="border border-line px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest text-ink-faint">
            AI
          </span>
        )}
      </div>
      <span
        className={`font-mono text-[9px] uppercase tracking-widest ${
          seat.ready || seat.isAi ? 'text-hot' : 'text-ink-ghost'
        }`}
      >
        {seat.isAi ? 'AUTO' : seat.ready ? 'READY' : 'IDLE'}
      </span>
    </li>
  );
}

function AddAiControl({ onAdd }: { onAdd: (archId: string) => void }) {
  const [archId, setArchId] = useState<string>(AI_ARCHETYPES[0]?.id ?? 'dilettante');
  const arch = AI_ARCHETYPES.find((a) => a.id === archId);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-2">
        <select
          data-testid="ai-archetype-select"
          value={archId}
          onChange={(e) => setArchId(e.target.value)}
          className="flex-1 border border-line bg-bg-0 px-3 py-2 font-mono text-[11px] uppercase tracking-widest text-ink-dim focus:border-hot focus:outline-none"
        >
          {AI_ARCHETYPES.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          data-testid="add-ai-btn"
          onClick={() => onAdd(archId)}
          className="border border-line px-4 font-mono text-[10px] uppercase tracking-widest text-ink-faint hover:border-line-2 hover:text-ink-dim"
        >
          + AI seat
        </button>
      </div>
      {arch && (
        <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-ink-ghost">
          {arch.tag}
        </p>
      )}
    </div>
  );
}

function EmptyRoomPlaceholder() {
  return (
    <div className="flex flex-col items-start gap-2 border border-dashed border-line bg-panel p-4">
      <h2 className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-ghost">Room</h2>
      <p className="font-mono text-[10px] uppercase tracking-widest text-ink-ghost">
        Pick a room on the left — or create one — to see seats, ready up, and launch.
      </p>
    </div>
  );
}
