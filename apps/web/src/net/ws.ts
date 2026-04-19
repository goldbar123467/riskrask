/**
 * WebSocket client stub.
 * Real implementation arrives in Track F (multiplayer wiring).
 * This module exposes a type-safe interface that Track F will fill.
 */

export interface WsClient {
  readonly connected: boolean;
  send: (msg: unknown) => void;
  close: () => void;
}

/** Track F will replace this with a real WebSocket connection. */
export function createWsClient(_roomId: string, _jwt: string): WsClient {
  // Stub — no-op
  return {
    connected: false,
    send: () => { /* Track F */ },
    close: () => { /* Track F */ },
  };
}
