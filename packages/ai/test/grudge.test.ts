import { describe, expect, test } from 'bun:test';
import { Grudge } from '../src/grudge.js';
import { P0, P1, P2 } from './helpers.js';

describe('Grudge', () => {
  test('recordGrudge accumulates severity', () => {
    let map = {};
    map = Grudge.record(map, P1, P0, 2, false, 1);
    expect(Grudge.severity(map, P1, P0)).toBeCloseTo(2 * 0.05);
    map = Grudge.record(map, P1, P0, 0, true, 2);
    expect(Grudge.severity(map, P1, P0)).toBeCloseTo(2 * 0.05 + 1.0);
  });

  test('tickGrudges decays severity', () => {
    let map = {};
    map = Grudge.record(map, P1, P0, 10, true, 1);
    const before = Grudge.severity(map, P1, P0);
    map = Grudge.tick(map);
    const after = Grudge.severity(map, P1, P0);
    expect(after).toBeLessThan(before);
    expect(after).toBeCloseTo(before * (1 - Grudge.DECAY_PER_TURN));
  });

  test('tickGrudges removes entries below MIN_ACTIVE', () => {
    let map = {};
    // Small grudge that will decay to below threshold
    map = Grudge.record(map, P1, P0, 1, false, 1); // severity = 0.05
    // Keep ticking until it's gone
    for (let i = 0; i < 20; i++) map = Grudge.tick(map);
    expect(Grudge.severity(map, P1, P0)).toBe(0);
  });

  test('severity returns 0 for unknown pair', () => {
    expect(Grudge.severity({}, P0, P1)).toBe(0);
  });

  test('recordGrudge is pure (does not mutate)', () => {
    const map = {};
    const orig = JSON.stringify(map);
    Grudge.record(map, P1, P0, 5, true, 1);
    expect(JSON.stringify(map)).toBe(orig);
  });

  test('separate grudge entries per victim', () => {
    let map = {};
    map = Grudge.record(map, P1, P0, 2, false, 1);
    map = Grudge.record(map, P2, P0, 3, false, 1);
    expect(Grudge.severity(map, P1, P0)).not.toBe(Grudge.severity(map, P2, P0));
  });
});
