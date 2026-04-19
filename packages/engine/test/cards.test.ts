import { describe, expect, test } from 'bun:test';
import { validSet, tradeValue, findBestSet } from '../src/cards';
import type { Card } from '../src/types';

const INF = (t?: string): Card => ({ type: 'Infantry', territory: t ?? 'Alaska' });
const CAV = (t?: string): Card => ({ type: 'Cavalry', territory: t ?? 'Brazil' });
const ART = (t?: string): Card => ({ type: 'Artillery', territory: t ?? 'China' });
const WILD = (): Card => ({ type: 'Wild', territory: null });

describe('validSet', () => {
  test('three of a kind', () => {
    expect(validSet([INF(), INF('Brazil'), INF('China')])).toBe(true);
  });
  test('one of each', () => {
    expect(validSet([INF(), CAV(), ART()])).toBe(true);
  });
  test('two of same is invalid', () => {
    expect(validSet([INF(), INF('Brazil'), CAV()])).toBe(false);
  });
  test('wild substitutes', () => {
    expect(validSet([WILD(), INF(), CAV()])).toBe(true);
    expect(validSet([WILD(), WILD(), INF()])).toBe(true);
  });
  test('requires exactly 3 cards', () => {
    expect(validSet([INF(), CAV()])).toBe(false);
    expect(validSet([INF(), CAV(), ART(), WILD()])).toBe(false);
  });
});

describe('tradeValue', () => {
  test('first 6 trades follow table', () => {
    expect(tradeValue(0)).toBe(4);
    expect(tradeValue(1)).toBe(6);
    expect(tradeValue(2)).toBe(8);
    expect(tradeValue(3)).toBe(10);
    expect(tradeValue(4)).toBe(12);
    expect(tradeValue(5)).toBe(15);
  });
  test('after 6 increases by 5 each', () => {
    expect(tradeValue(6)).toBe(20);
    expect(tradeValue(7)).toBe(25);
    expect(tradeValue(8)).toBe(30);
  });
});

describe('findBestSet', () => {
  test('returns null when no valid set', () => {
    const cards: Card[] = [INF(), INF('Brazil'), INF('China'), CAV()];
    // Actually 3 Infantry IS valid; let's use a case with no valid set
    const noSet: Card[] = [INF(), CAV(), CAV('India')];
    expect(findBestSet(noSet, new Set())).toBeNull();
  });

  test('prefers set with owned-territory matches', () => {
    const cards: Card[] = [
      INF('Alaska'),
      CAV('Brazil'),
      ART('China'),
      INF('Ontario'),
    ];
    // one-of-each is valid; Alaska is owned
    const owned = new Set(['Alaska']);
    const result = findBestSet(cards, owned);
    expect(result).not.toBeNull();
    // Should include index 0 (Alaska Infantry)
    expect(result).toContain(0);
  });
});
