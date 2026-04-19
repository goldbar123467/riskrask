import { describe, expect, test } from 'bun:test';
import { BOARD_TERRITORY_COUNT, STARTING_ARMIES } from '../src/board';
import { createInitialState } from '../src/setup';

const PLAYERS_3 = [
  { id: '0' as const, name: 'Alice', color: '#dc2626', isAI: false },
  { id: '1' as const, name: 'Bob', color: '#2563eb', isAI: false },
  { id: '2' as const, name: 'Carol', color: '#059669', isAI: false },
];

describe('createInitialState', () => {
  test('all 42 territories start unowned with 0 armies', () => {
    const s = createInitialState({ seed: 'test', players: PLAYERS_3 });
    const terrNames = Object.keys(s.territories);
    expect(terrNames).toHaveLength(BOARD_TERRITORY_COUNT);
    for (const name of terrNames) {
      const t = s.territories[name];
      expect(t).toBeDefined();
      if (!t) continue;
      expect(t.owner).toBeNull();
      expect(t.armies).toBe(0);
    }
  });

  test('phase is setup-claim', () => {
    const s = createInitialState({ seed: 'test', players: PLAYERS_3 });
    expect(s.phase).toBe('setup-claim');
  });

  test('turn is 0 and currentPlayerIdx is 0', () => {
    const s = createInitialState({ seed: 'test', players: PLAYERS_3 });
    expect(s.turn).toBe(0);
    expect(s.currentPlayerIdx).toBe(0);
  });

  test('each player starts with STARTING_ARMIES reserves', () => {
    const s = createInitialState({ seed: 'test', players: PLAYERS_3 });
    const expected = STARTING_ARMIES[3];
    expect(expected).toBeDefined();
    for (const p of s.players) {
      expect(p.reserves).toBe(expected);
    }
  });

  test('deck has 44 cards (42 territory + 2 wild)', () => {
    const s = createInitialState({ seed: 'test', players: PLAYERS_3 });
    expect(s.deck.length + s.discard.length).toBe(44);
  });

  test('same seed produces same deck order', () => {
    const a = createInitialState({ seed: 'same', players: PLAYERS_3 });
    const b = createInitialState({ seed: 'same', players: PLAYERS_3 });
    expect(a.deck.map((c) => c.territory)).toEqual(b.deck.map((c) => c.territory));
  });

  test('schemaVersion is 1', () => {
    const s = createInitialState({ seed: 'test', players: PLAYERS_3 });
    expect(s.schemaVersion).toBe(1);
  });
});
