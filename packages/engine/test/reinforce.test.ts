import { describe, expect, test } from 'bun:test';
import { calcReinforcements } from '../src/reinforce';
import { createInitialState } from '../src/setup';
import type { GameState, PlayerState, TerritoryState } from '../src/types';

const PLAYERS = [
  { id: '0' as const, name: 'Alice', color: '#dc2626', isAI: false },
  { id: '1' as const, name: 'Bob', color: '#2563eb', isAI: false },
  { id: '2' as const, name: 'Carol', color: '#059669', isAI: false },
];

function makeState(overrides?: Partial<GameState>): GameState {
  return {
    ...createInitialState({ seed: 'test', players: PLAYERS }),
    ...overrides,
  };
}

describe('calcReinforcements', () => {
  test('minimum 3 for few territories', () => {
    const s = makeState();
    // player 0 owns nothing → min 3
    const result = calcReinforcements(s, '0');
    expect(result).toBe(3);
  });

  test('base = floor(owned / 3), min 3 (no continent bonus)', () => {
    const s = makeState();
    // Give player 0 exactly 9 territories that span multiple continents
    // so no single continent is fully owned
    // Take 4 from NA and 5 from EU — neither continent is complete
    const naPartial = ['Alaska', 'Northwest Territory', 'Greenland', 'Alberta'];
    const euPartial = ['Iceland', 'Scandinavia', 'Great Britain', 'Northern Europe', 'Ukraine'];
    const names = [...naPartial, ...euPartial];
    const territories = { ...s.territories };
    for (const n of names) {
      territories[n] = { ...territories[n]!, owner: '0' };
    }
    const result = calcReinforcements({ ...s, territories }, '0');
    expect(result).toBe(3); // floor(9/3) = 3, no continent bonus
  });

  test('continent bonus added', () => {
    // Give player 0 all of Australia (4 territories, bonus 2)
    const s = makeState();
    const auTerrs = ['Indonesia', 'New Guinea', 'Western Australia', 'Eastern Australia'];
    const territories = { ...s.territories };
    for (const n of auTerrs) {
      territories[n] = { ...territories[n]!, owner: '0' };
    }
    const result = calcReinforcements({ ...s, territories }, '0');
    // floor(4/3) = 1, min 3; + 2 continent bonus = 5
    expect(result).toBe(5);
  });

  test('12 territories = 4 base reinforcements (no continent bonus)', () => {
    const s = makeState();
    // 12 territories spread across continents without completing any
    const names = [
      'Alaska',
      'Northwest Territory',
      'Greenland',
      'Alberta', // NA partial (4)
      'Iceland',
      'Scandinavia',
      'Great Britain',
      'Northern Europe', // EU partial (4)
      'North Africa',
      'Egypt',
      'East Africa',
      'Congo', // AF partial (4)
    ];
    const territories = { ...s.territories };
    for (const n of names) {
      territories[n] = { ...territories[n]!, owner: '0' };
    }
    const result = calcReinforcements({ ...s, territories }, '0');
    expect(result).toBe(4); // floor(12/3) = 4, no continent bonus
  });
});
