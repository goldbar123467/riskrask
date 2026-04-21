/**
 * Room dispatcher — multiplayer parallel to `useSoloDispatcher`.
 *
 * Owns a single `WsClient` for the lifetime of the component. Translates
 * server frames into `useGame` store mutations and client intents into
 * outbound `intent` / `chat` frames. Validation of incoming frames happens
 * inside `createWsClient`; this hook only consumes already-parsed `ServerMsg`
 * values.
 *
 * Determinism note: on `applied` we re-run the local reducer via `dispatch`
 * rather than trusting the wire-provided effects. If our `nextHash` diverges
 * from the server's we log a warning — a future welcome-delta replay is the
 * planned recovery path.
 */

import { type Action, type Effect, type GameState, hashState } from '@riskrask/engine';
import { useEffect, useRef, useState } from 'react';
import type { SeatInfo, ServerMsg } from '../net/protocol';
import { type WsClient, type WsState, createWsClient } from '../net/ws';
import { useGame } from './useGame';

export interface RoomError {
  code: string;
  detail?: string;
}

export interface UseRoomDispatcherOpts {
  roomId: string;
  seatIdx: number;
  token: string;
  /** Tests pass a `ws://` URL directly; production derives from location. */
  url?: string;
}

export interface UseRoomDispatcherResult {
  connState: WsState;
  seq: number;
  seats: SeatInfo[];
  sendIntent: (action: Action) => void;
  sendChat: (text: string) => void;
  lastError: RoomError | null;
}

export function useRoomDispatcher(opts: UseRoomDispatcherOpts): UseRoomDispatcherResult {
  const { roomId, seatIdx, token, url } = opts;
  const clientRef = useRef<WsClient | null>(null);
  const [connState, setConnState] = useState<WsState>('connecting');
  const [seq, setSeq] = useState(0);
  const [seats, setSeats] = useState<SeatInfo[]>([]);
  const [lastError, setLastError] = useState<RoomError | null>(null);

  useEffect(() => {
    const client = createWsClient(
      url !== undefined ? { roomId, seatIdx, token, url } : { roomId, seatIdx, token },
    );
    clientRef.current = client;

    const offState = client.onState((s) => {
      setConnState(s);
    });

    const offMsg = client.onMessage((msg: ServerMsg) => {
      handleServerMsg(msg, { setSeq, setSeats, setLastError });
    });

    return () => {
      offState();
      offMsg();
      client.close();
      clientRef.current = null;
    };
  }, [roomId, seatIdx, token, url]);

  const sendIntent = (action: Action): void => {
    const client = clientRef.current;
    if (!client) return;
    const current = useGame.getState().state;
    const clientHash = current ? hashState(current) : undefined;
    client.send({
      type: 'intent',
      action,
      ...(clientHash !== undefined ? { clientHash } : {}),
    });
  };

  const sendChat = (text: string): void => {
    const client = clientRef.current;
    if (!client) return;
    const trimmed = text.trim();
    if (trimmed.length === 0) return;
    client.send({ type: 'chat', text: trimmed.slice(0, 512) });
  };

  return { connState, seq, seats, sendIntent, sendChat, lastError };
}

interface Sinks {
  setSeq: (n: number) => void;
  setSeats: (s: SeatInfo[]) => void;
  setLastError: (e: RoomError | null) => void;
}

function handleServerMsg(msg: ServerMsg, sinks: Sinks): void {
  switch (msg.type) {
    case 'welcome': {
      // The engine `GameState` shape is opaque on the wire; the reducer will
      // reject anything malformed on the next dispatch, which is our real
      // canary. For now we trust the server-computed hash as the authoritative
      // sentinel.
      useGame.getState().loadState(msg.state as GameState);
      sinks.setSeats(msg.seats);
      sinks.setSeq(msg.seq);
      sinks.setLastError(null);
      return;
    }
    case 'applied': {
      sinks.setSeq(msg.seq);
      const action = msg.action as Action;
      // Preferred path: re-run the local reducer so effects are derived,
      // not trusted. If the reducer rejects, fall back to the server-sent
      // effect stream so UI state doesn't drift.
      try {
        useGame.getState().dispatch(action);
      } catch (e) {
        console.warn('[room] local reducer rejected applied action', e);
        const effects = Array.isArray(msg.effects) ? (msg.effects as Effect[]) : [];
        useGame.getState().applyEffects(effects);
        return;
      }
      // Hash reconciliation — mismatch means our local state drifted from the
      // server. Log for now; a welcome-delta resync will harden this later.
      const localState = useGame.getState().state;
      if (localState) {
        const localHash = hashState(localState);
        if (localHash !== msg.nextHash) {
          console.warn('[room] hash mismatch', {
            local: localHash,
            server: msg.nextHash,
            seq: msg.seq,
          });
        }
      }
      return;
    }
    case 'chat': {
      // Chat rendering lives elsewhere; we don't clutter the game store with
      // presentational slices. A future chat hook will subscribe to WS
      // directly. For now we simply ignore.
      return;
    }
    case 'presence': {
      // Seat `connected` flags live inside `seats`; flip in place without
      // flushing the whole array identity unnecessarily would be nicer, but
      // arrays are small (≤ 6) so a shallow rebuild is fine.
      // We can't reach into local `seats` here; the consumer sees the flag via
      // the `seats` state snapshot from `welcome`, which Track C will refresh
      // on presence changes via a dedicated frame. Until then, keep this a
      // no-op so the union stays exhaustive.
      return;
    }
    case 'ai-takeover': {
      sinks.setLastError({
        code: 'AI_TAKEOVER',
        detail: `seat ${msg.seatIdx} handed to AI`,
      });
      return;
    }
    case 'desync': {
      sinks.setLastError({ code: 'DESYNC', detail: msg.reason });
      return;
    }
    case 'error': {
      sinks.setLastError(
        msg.detail !== undefined ? { code: msg.code, detail: msg.detail } : { code: msg.code },
      );
      return;
    }
    default: {
      // Exhaustive check — if a new variant appears the switch will fail
      // to type-check here at the `never` assignment.
      const _exhaustive: never = msg;
      void _exhaustive;
      return;
    }
  }
}
