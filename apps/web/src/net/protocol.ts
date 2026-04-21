/**
 * Web-side re-export of the multiplayer wire protocol.
 *
 * Keeps `apps/web` imports free of deep `@riskrask/shared` paths and gives
 * us one obvious seam to stub in tests if we ever need to.
 */

export {
  ClientMsgSchema,
  ServerMsgSchema,
  type ClientMsg,
  type ServerMsg,
  type SeatInfo,
} from '@riskrask/shared';
