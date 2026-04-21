import '@testing-library/jest-dom/vitest';

// WebSocket is NOT polyfilled globally. Tests that need it opt in via
// `vi.stubGlobal('WebSocket', MockWebSocket)` inside their own `beforeEach`.
// See `src/net/ws.test.ts` and `src/game/useRoomDispatcher.test.ts` for the
// canonical pattern. Keeping the install opt-in prevents a half-working mock
// from leaking into unrelated DOM tests.
