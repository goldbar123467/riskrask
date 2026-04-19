import { describe, expect, test } from 'bun:test';
import { hashState } from '../src/hash';

describe('hashState', () => {
  test('same state hashes to same value', () => {
    const state = { turn: 1, phase: 'reinforce', players: [{ id: '0', reserves: 5 }] };
    expect(hashState(state)).toBe(hashState(state));
  });

  test('mutated state produces different hash', () => {
    const a = { turn: 1, phase: 'reinforce', reserves: 10 };
    const b = { turn: 1, phase: 'reinforce', reserves: 11 };
    expect(hashState(a)).not.toBe(hashState(b));
  });

  test('returns 16-char hex string', () => {
    const h = hashState({ x: 1 });
    expect(h).toHaveLength(16);
    expect(h).toMatch(/^[0-9a-f]+$/);
  });

  test('key order does not affect hash', () => {
    const a = { alpha: 1, beta: 2 };
    const b = { beta: 2, alpha: 1 };
    expect(hashState(a)).toBe(hashState(b));
  });
});
