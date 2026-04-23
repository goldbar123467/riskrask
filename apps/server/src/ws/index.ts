/**
 * WebSocket upgrade for the room protocol.
 *
 * Uses `hono/bun`'s `createBunWebSocket()` which returns a pair —
 * `upgradeWebSocket` (middleware-style) and `websocket` (the Bun-level
 * handler that is passed to `Bun.serve({ fetch, websocket })`).
 *
 * Auth: JWT is provided via `?token=...&seat=...&roomId=...` query params.
 * The Authorization header is not a reliable channel for WebSocket clients
 * (browsers don't let you set it on new WebSocket()).
 *
 * Protocol: all frames are JSON; zod validates on ingress via
 * `ClientMsgSchema` from @riskrask/shared.
 */

import type { Action } from '@riskrask/engine';
import { ClientMsgSchema, type ServerMsg } from '@riskrask/shared';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Hono } from 'hono';
import { createBunWebSocket } from 'hono/bun';
import { verifySupabaseJwt } from '../auth/verify';
import { type Room, RoomError } from '../rooms/Room';
import { ensureHydrated } from '../rooms/hydrate';
import { registry } from '../rooms/registry';
import { anonClient } from '../supabase';

const { upgradeWebSocket, websocket } = createBunWebSocket();

export const wsRouter = new Hono();

interface AttachedWs {
  send: (data: string) => void;
}

interface SessionState {
  roomId: string;
  seatIdx: number;
  userId: string;
  attached: boolean;
}

wsRouter.get(
  '/ws/:roomId',
  upgradeWebSocket((c) => {
    const roomId = c.req.param('roomId') ?? '';
    const token = c.req.query('token') ?? '';
    const seatRaw = c.req.query('seat') ?? '';
    const seatIdx = Number(seatRaw);

    // `?lastSeq=N` lets a reconnecting client ask the server to fast-forward
    // from a known-good seq instead of full-hydrating. Validated below.
    const lastSeqRaw = c.req.query('lastSeq');
    const lastSeqParsed = lastSeqRaw !== undefined ? Number(lastSeqRaw) : undefined;
    const lastSeq =
      lastSeqParsed !== undefined && Number.isInteger(lastSeqParsed) && lastSeqParsed >= 0
        ? lastSeqParsed
        : undefined;

    const session: SessionState = {
      roomId,
      seatIdx,
      userId: '',
      attached: false,
    };

    return {
      async onOpen(_evt, ws) {
        // Validate query params up front.
        if (!roomId || !Number.isInteger(seatIdx) || seatIdx < 0) {
          sendJson(ws, { type: 'error', code: 'BAD_REQUEST', detail: 'roomId + seat required' });
          ws.close(1008, 'bad request');
          return;
        }

        const user = await verifySupabaseJwt(token ? `Bearer ${token}` : null);
        if (!user) {
          sendJson(ws, { type: 'error', code: 'UNAUTHORIZED' });
          ws.close(1008, 'unauthorized');
          return;
        }
        session.userId = user.id;

        // Lazy-hydrate from DB when the in-memory Room is gone (server
        // restart, etc.) but the `games` row still exists. Idempotent — if
        // already hydrated, this is a cheap `registry.get`.
        const room = (await ensureHydrated(roomId)) ?? registry.get(roomId);
        if (!room) {
          sendJson(ws, { type: 'error', code: 'ROOM_NOT_FOUND' });
          ws.close(1011, 'room not found');
          return;
        }
        const seat = room.getSeat(seatIdx);
        if (!seat) {
          sendJson(ws, { type: 'error', code: 'UNKNOWN_SEAT' });
          ws.close(1008, 'unknown seat');
          return;
        }
        if (seat.userId !== user.id) {
          sendJson(ws, { type: 'error', code: 'SEAT_MISMATCH' });
          ws.close(1008, 'seat mismatch');
          return;
        }

        // Register the send callback on the Room.
        const attached: AttachedWs = { send: (data) => ws.send(data) };
        room.attach(seatIdx, {
          send: (msg) => attached.send(JSON.stringify(msg)),
          close: (code, reason) => {
            try {
              ws.close(code ?? 1000, reason);
            } catch {
              // WS already closed; no-op.
            }
          },
        });
        session.attached = true;

        sendWelcomeWithDelta((m) => sendJson(ws, m), room, seatIdx, lastSeq);
      },

      async onMessage(evt, ws) {
        const raw = typeof evt.data === 'string' ? evt.data : String(evt.data);
        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch {
          sendJson(ws, { type: 'error', code: 'MALFORMED_JSON' });
          return;
        }
        const msg = ClientMsgSchema.safeParse(parsed);
        if (!msg.success) {
          sendJson(ws, { type: 'error', code: 'INVALID_MESSAGE' });
          return;
        }

        const room = registry.get(session.roomId);
        if (!room) {
          sendJson(ws, { type: 'error', code: 'ROOM_NOT_FOUND' });
          return;
        }

        switch (msg.data.type) {
          case 'join':
            // No-op post-open; clients shouldn't send this after the welcome.
            return;
          case 'heartbeat':
            return;
          case 'chat': {
            // Persist first (source of truth), then broadcast to connected
            // clients. If the RPC errors, we surface the failure to the
            // caller and skip the broadcast so they can retry without
            // desyncing the room history.
            const persistErr = await persistChat(
              anonClient(token) as unknown as SupabaseClient,
              session.roomId,
              msg.data.text,
            );
            if (persistErr) {
              sendJson(ws, {
                type: 'error',
                code: 'CHAT_PERSIST_FAILED',
                detail: persistErr,
              });
              return;
            }
            room.broadcast({
              type: 'chat',
              userId: session.userId,
              text: msg.data.text,
              ts: Date.now(),
            });
            return;
          }
          case 'intent': {
            const action = msg.data.action as Action;
            try {
              await room.applyIntent(
                session.seatIdx,
                action,
                ...(msg.data.clientHash !== undefined ? [msg.data.clientHash] : []),
              );
            } catch (err) {
              if (err instanceof RoomError) {
                sendJson(ws, {
                  type: 'error',
                  code: err.code,
                  ...(err.detail !== undefined ? { detail: err.detail } : {}),
                });
              } else {
                sendJson(ws, {
                  type: 'error',
                  code: 'INTERNAL_ERROR',
                  detail: err instanceof Error ? err.message : 'unknown',
                });
              }
            }
            return;
          }
        }
      },

      onClose() {
        if (!session.attached) return;
        const room = registry.get(session.roomId);
        if (room) room.detach(session.seatIdx);
      },

      onError() {
        if (!session.attached) return;
        const room = registry.get(session.roomId);
        if (room) room.detach(session.seatIdx);
      },
    };
  }),
);

function sendJson(
  ws: { send: (data: string) => void; close?: (code?: number, reason?: string) => void },
  msg: ServerMsg,
): void {
  ws.send(JSON.stringify(msg));
}

/**
 * Emit the welcome frame, followed by any `applied` frames above `lastSeq`
 * if the caller provided one and the in-memory event log covers the gap.
 *
 * Exported for unit tests — the live WS handler passes a closure over
 * `ws.send` as `send`; tests pass an array-push recorder.
 */
export function sendWelcomeWithDelta(
  send: (msg: ServerMsg) => void,
  room: Room,
  seatIdx: number,
  lastSeq: number | undefined,
): void {
  const turnDeadlineMs = room.getTurnDeadline();
  send({
    type: 'welcome',
    gameId: room.gameId,
    seatIdx,
    state: room.getState(),
    seats: room.getSeats().map((s) => ({
      seatIdx: s.seatIdx,
      userId: s.userId,
      isAi: s.isAi,
      archId: s.archId,
      connected: s.connected,
    })),
    hash: room.getHash(),
    seq: room.getSeq(),
    ...(turnDeadlineMs !== null ? { turnDeadlineMs } : {}),
  });

  if (lastSeq === undefined || lastSeq === 0) return;

  const log = room.getEventLog();
  const currentSeq = room.getSeq();
  // If the log doesn't cover the full range (lastSeq+1 .. currentSeq), the
  // welcome already carries the canonical state — the client treats this as
  // a fresh hydrate. Log a warn so ops can spot aggressive replay after a
  // server restart (event log is in-memory only).
  if (lastSeq < currentSeq && (log.length === 0 || log[0]!.seq > lastSeq + 1)) {
    console.warn('[ws] delta replay unavailable, fell back to full welcome', {
      roomId: room.roomId,
      lastSeq,
      currentSeq,
      logStart: log[0]?.seq ?? null,
    });
    return;
  }

  for (const entry of log) {
    if (entry.seq <= lastSeq) continue;
    send({
      type: 'applied',
      seq: entry.seq,
      action: entry.action,
      nextHash: entry.hash,
      effects: entry.effects,
    });
  }
}

/**
 * Call `send_chat` RPC with the user-scoped anon client. Returns `null` on
 * success, or the error message on failure. Exported for tests that want
 * to drive the persistence flow without standing up a WebSocket.
 */
export async function persistChat(
  client: SupabaseClient,
  roomId: string,
  text: string,
): Promise<string | null> {
  try {
    const { error } = await client.rpc('send_chat', {
      p_room_id: roomId,
      p_text: text,
    });
    if (error) return error.message;
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : 'unknown';
  }
}

export { websocket };
