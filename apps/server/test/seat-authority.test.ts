import { describe, expect, it } from 'bun:test';
import { createInitialState } from '@riskrask/engine';
import { Room, RoomError } from '../src/rooms/Room';
import type { Seat } from '../src/rooms/seat';

describe('Room.applyIntent seat authority', () => {
  it('rejects intent from the wrong userId', async () => {
    const state = createInitialState({
      seed: 'auth-seed',
      players: [
        { id: 'p1', name: 'P1', color: '#f00', isAI: false },
        { id: 'p2', name: 'P2', color: '#0f0', isAI: false },
        { id: 'p3', name: 'P3', color: '#00f', isAI: false },
      ],
    });
    const seats: Seat[] = [
      { seatIdx: 0, userId: 'u1', isAi: false, archId: null, connected: true, afk: false },
      { seatIdx: 1, userId: 'u2', isAi: false, archId: null, connected: true, afk: false },
      { seatIdx: 2, userId: 'u3', isAi: false, archId: null, connected: true, afk: false },
    ];
    const room = new Room('r1', 'g1', state, seats);
    const free = Object.keys(state.territories)[0]!;
    // seat 0 is u1; an intent carrying expectedUserId u2 must reject.
    await expect(
      room.applyIntent(0, { type: 'claim-territory', territory: free as never }, undefined, 'u2'),
    ).rejects.toBeInstanceOf(RoomError);
  });

  it('accepts intent when expectedUserId matches the seat owner', async () => {
    const state = createInitialState({
      seed: 'auth-seed-ok',
      players: [
        { id: 'p1', name: 'P1', color: '#f00', isAI: false },
        { id: 'p2', name: 'P2', color: '#0f0', isAI: false },
        { id: 'p3', name: 'P3', color: '#00f', isAI: false },
      ],
    });
    const seats: Seat[] = [
      { seatIdx: 0, userId: 'u1', isAi: false, archId: null, connected: true, afk: false },
      { seatIdx: 1, userId: 'u2', isAi: false, archId: null, connected: true, afk: false },
      { seatIdx: 2, userId: 'u3', isAi: false, archId: null, connected: true, afk: false },
    ];
    const room = new Room('r1', 'g1', state, seats);
    const free = Object.keys(state.territories)[0]!;
    const res = await room.applyIntent(
      0,
      { type: 'claim-territory', territory: free as never },
      undefined,
      'u1',
    );
    expect(res.seq).toBe(1);
  });
});
