import { describe, expect, test } from 'bun:test';
import { createRng, rollDie } from '../src/rng';

describe('rng', () => {
  test('same seed produces identical sequence', () => {
    const a = createRng('seed-1');
    const b = createRng('seed-1');
    const aOut = Array.from({ length: 20 }, () => rollDie(a));
    const bOut = Array.from({ length: 20 }, () => rollDie(b));
    expect(aOut).toEqual(bOut);
  });
  test('dies are 1..6', () => {
    const r = createRng('x');
    for (let i = 0; i < 1000; i++) {
      const v = rollDie(r);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(6);
    }
  });
  test('cursor advances by 1 per roll', () => {
    const r = createRng('c');
    rollDie(r);
    rollDie(r);
    rollDie(r);
    expect(r.cursor).toBe(3);
  });
});
