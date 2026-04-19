import { describe, expect, test } from 'bun:test';
import { canFortify, doFortify } from '../src/fortify';
import { createInitialState } from '../src/setup';
import type { GameState } from '../src/types';

const PLAYERS = [
  { id: '0' as const, name: 'Alice', color: '#dc2626', isAI: false },
  { id: '1' as const, name: 'Bob', color: '#2563eb', isAI: false },
  { id: '2' as const, name: 'Carol', color: '#059669', isAI: false },
];

function makeState(): GameState {
  const s = createInitialState({ seed: 'fortify-test', players: PLAYERS });
  const territories = { ...s.territories };
  // Player 0 owns Alaska (5), Northwest Territory (3), Alberta (2)
  // Player 1 owns Kamchatka (3)
  territories['Alaska'] = { ...territories['Alaska']!, owner: '0', armies: 5 };
  territories['Northwest Territory'] = {
    ...territories['Northwest Territory']!,
    owner: '0',
    armies: 3,
  };
  territories['Alberta'] = { ...territories['Alberta']!, owner: '0', armies: 2 };
  territories['Kamchatka'] = { ...territories['Kamchatka']!, owner: '1', armies: 3 };
  return { ...s, phase: 'fortify', territories };
}

describe('canFortify', () => {
  test('valid: adjacent, both owned, src > 1', () => {
    const s = makeState();
    expect(canFortify(s, 'Alaska', 'Northwest Territory', '0')).toBe(true);
  });

  test('invalid: not owned by player', () => {
    const s = makeState();
    expect(canFortify(s, 'Alaska', 'Kamchatka', '0')).toBe(false);
  });

  test('invalid: src has only 1 army', () => {
    const s = makeState();
    const territories = { ...s.territories };
    territories['Alaska'] = { ...territories['Alaska']!, armies: 1 };
    expect(canFortify({ ...s, territories }, 'Alaska', 'Northwest Territory', '0')).toBe(false);
  });

  test('valid: connected through owned chain', () => {
    // Alaska → Northwest Territory → Alberta (connected through owned)
    const s = makeState();
    expect(canFortify(s, 'Alaska', 'Alberta', '0')).toBe(true);
  });

  test('invalid: not connected through owned territories', () => {
    // Brazil → Argentina are adjacent, but if player doesn't own one of them
    const s = makeState();
    // Neither Brazil nor Argentina is owned by player 0 in this test
    expect(canFortify(s, 'Brazil', 'Argentina', '0')).toBe(false);
  });
});

describe('doFortify', () => {
  test('moves armies from source to target', () => {
    const s = makeState();
    const result = doFortify(s, 'Alaska', 'Northwest Territory', 2);
    expect(result.next.territories['Alaska']!.armies).toBe(3);
    expect(result.next.territories['Northwest Territory']!.armies).toBe(5);
  });

  test('throws on invalid count (0)', () => {
    const s = makeState();
    expect(() => doFortify(s, 'Alaska', 'Northwest Territory', 0)).toThrow();
  });

  test('throws when count >= src armies', () => {
    const s = makeState();
    expect(() => doFortify(s, 'Alaska', 'Northwest Territory', 5)).toThrow();
  });

  test('throws when player does not own src', () => {
    const s = makeState();
    expect(() => doFortify(s, 'Kamchatka', 'Mongolia', 1)).toThrow();
  });
});
