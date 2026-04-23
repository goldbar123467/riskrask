import { describe, expect, it } from 'bun:test';
import { createInitialState } from '@riskrask/engine';
import { Room } from '../src/rooms/Room';
import type { Seat } from '../src/rooms/seat';

describe('Room.hydrateEventLog', () => {
  it('loads prior entries and updates seq + hash', () => {
    const state = createInitialState({
      seed: 'hydrate-seed',
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
    expect(room.getSeq()).toBe(0);
    expect(room.getEventLog().length).toBe(0);
    room.hydrateEventLog([
      {
        seq: 1,
        turn: 0,
        actorId: 'u1',
        action: { type: 'claim-territory', territory: 'Alaska' } as never,
        hash: 'h1',
        effects: [],
      },
      {
        seq: 2,
        turn: 0,
        actorId: 'u2',
        action: { type: 'claim-territory', territory: 'Alberta' } as never,
        hash: 'h2',
        effects: [],
      },
    ]);
    expect(room.getSeq()).toBe(2);
    expect(room.getHash()).toBe('h2');
    expect(room.getEventLog().length).toBe(2);

    // Idempotent — second call is a no-op.
    room.hydrateEventLog([
      {
        seq: 99,
        turn: 0,
        actorId: null,
        action: { type: 'end-turn' } as never,
        hash: 'bogus',
        effects: [],
      },
    ]);
    expect(room.getSeq()).toBe(2);
    expect(room.getHash()).toBe('h2');
  });
});
