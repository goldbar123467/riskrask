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
import { Hono } from 'hono';
import { createBunWebSocket } from 'hono/bun';
import { verifySupabaseJwt } from '../auth/verify';
import { RoomError } from '../rooms/Room';
import { registry } from '../rooms/registry';

const { upgradeWebSocket, websocket } = createBunWebSocket();

export const wsRouter = new Hono();

interface AttachedSocket {
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

        const room = registry.get(roomId);
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
        const attached: AttachedSocket = { send: (data) => ws.send(data) };
        room.attach(seatIdx, (msg) => attached.send(JSON.stringify(msg)));
        session.attached = true;

        sendJson(ws, {
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
        });
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
          case 'chat':
            // Chat persistence is deferred to Task 8; broadcast locally so
            // connected players still see messages in-session.
            room.broadcast({
              type: 'chat',
              userId: session.userId,
              text: msg.data.text,
              ts: Date.now(),
            });
            return;
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

export { websocket };
