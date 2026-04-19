export const SAVE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ' as const;
export const SAVE_CODE_RE = /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$/;
export const ROOM_CODE_RE = /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/;
export const CURRENT_SCHEMA_VERSION = 1 as const;

export * from './saveCode';
export * from './types';
