import { describe, expect, test } from 'bun:test';
import {
  ADJ_PAIRS,
  BOARD_TERRITORY_COUNT,
  CONTINENTS,
  STARTING_ARMIES,
  TERRITORIES,
} from '../src/board';

describe('board constants', () => {
  test('has 42 territories', () => {
    expect(Object.keys(TERRITORIES)).toHaveLength(42);
    expect(BOARD_TERRITORY_COUNT).toBe(42);
  });
  test('has 6 continents', () => {
    expect(Object.keys(CONTINENTS)).toHaveLength(6);
  });
  test('every territory belongs to exactly one continent', () => {
    for (const name of Object.keys(TERRITORIES)) {
      const hits = Object.values(CONTINENTS).filter((c) => c.members.includes(name));
      expect(hits).toHaveLength(1);
    }
  });
  test('adjacency is symmetric', () => {
    for (const [a, b] of ADJ_PAIRS) {
      expect(
        ADJ_PAIRS.some(([x, y]) => x === b && y === a) ||
          ADJ_PAIRS.some(([x, y]) => x === a && y === b),
      ).toBe(true);
    }
  });
  test('starting armies table covers 3–6 players', () => {
    expect(STARTING_ARMIES).toEqual({ 3: 35, 4: 30, 5: 25, 6: 20 });
  });
});
