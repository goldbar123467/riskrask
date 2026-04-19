import { describe, expect, test } from 'bun:test';
import { rollAttack, blitz } from '../src/combat';
import { createInitialState } from '../src/setup';
import { createRng } from '../src/rng';
import type { GameState } from '../src/types';

const PLAYERS = [
  { id: '0' as const, name: 'Alice', color: '#dc2626', isAI: false },
  { id: '1' as const, name: 'Bob', color: '#2563eb', isAI: false },
  { id: '2' as const, name: 'Carol', color: '#059669', isAI: false },
];

function makeState(): GameState {
  const s = createInitialState({ seed: 'combat-test', players: PLAYERS });
  // Setup: Alaska (player 0, 5 armies) attacks Kamchatka (player 1, 2 armies)
  const territories = { ...s.territories };
  territories['Alaska'] = { ...territories['Alaska']!, owner: '0', armies: 5 };
  territories['Kamchatka'] = { ...territories['Kamchatka']!, owner: '1', armies: 2 };
  return { ...s, phase: 'attack', territories };
}

describe('rollAttack', () => {
  test('attacker must own src territory', () => {
    const s = makeState();
    const rng = createRng('test');
    expect(() => rollAttack(s, 'Kamchatka', 'Alaska', rng)).toThrow();
  });

  test('src must be adjacent to tgt', () => {
    const s = makeState();
    const territories = { ...s.territories };
    territories['Brazil'] = { ...territories['Brazil']!, owner: '0', armies: 5 };
    const rng = createRng('test');
    expect(() => rollAttack({ ...s, territories }, 'Brazil', 'Alaska', rng)).toThrow();
  });

  test('src armies must be > 1', () => {
    const s = makeState();
    const territories = { ...s.territories };
    territories['Alaska'] = { ...territories['Alaska']!, armies: 1 };
    const rng = createRng('test');
    expect(() => rollAttack({ ...s, territories }, 'Alaska', 'Kamchatka', rng)).toThrow();
  });

  test('dice counts: max 3 attacker, max 2 defender', () => {
    // 5 attacking: min(3, 5-1) = 3 atk, min(2, 2) = 2 def
    const s = makeState();
    const rng = createRng('deterministic');
    const result = rollAttack(s, 'Alaska', 'Kamchatka', rng);
    expect(result.atkDice).toHaveLength(3);
    expect(result.defDice).toHaveLength(2);
  });

  test('all dice are 1–6', () => {
    const s = makeState();
    const rng = createRng('dice-range-test');
    const result = rollAttack(s, 'Alaska', 'Kamchatka', rng);
    for (const d of [...result.atkDice, ...result.defDice]) {
      expect(d).toBeGreaterThanOrEqual(1);
      expect(d).toBeLessThanOrEqual(6);
    }
  });

  test('armies are reduced after roll', () => {
    const s = makeState();
    const rng = createRng('loss-test');
    const result = rollAttack(s, 'Alaska', 'Kamchatka', rng);
    const atkBefore = 5;
    const defBefore = 2;
    const totalLost = result.atkLost + result.defLost;
    expect(totalLost).toBeGreaterThan(0);
    expect(result.next.territories['Alaska']!.armies).toBe(atkBefore - result.atkLost);
    expect(result.next.territories['Kamchatka']!.armies).toBe(defBefore - result.defLost);
  });

  test('territory captured when defender reaches 0', () => {
    // Force a capture: Alaska 10 armies vs Kamchatka 1 army
    const s = makeState();
    const territories = { ...s.territories };
    territories['Alaska'] = { ...territories['Alaska']!, armies: 10 };
    territories['Kamchatka'] = { ...territories['Kamchatka']!, armies: 1 };
    const forceCapture = { ...s, territories };
    // Use a seed that we know produces attacker wins (just try until captured)
    let captured = false;
    for (let seed = 0; seed < 100; seed++) {
      const rng = createRng(`cap-${seed}`);
      const r = rollAttack(forceCapture, 'Alaska', 'Kamchatka', rng);
      if (r.captured) {
        expect(r.next.territories['Kamchatka']!.owner).toBe('0');
        expect(r.next.pendingMove).toBeDefined();
        captured = true;
        break;
      }
    }
    expect(captured).toBe(true);
  });

  test('rngCursor advances per die rolled', () => {
    const s = makeState();
    const rng = createRng('cursor-test');
    const result = rollAttack(s, 'Alaska', 'Kamchatka', rng);
    // 3 atk + 2 def = 5 dice
    expect(result.next.rngCursor).toBe(5);
  });
});

describe('blitz', () => {
  test('blitz repeats until capture or attacker has 1 army', () => {
    const s = makeState();
    const rng = createRng('blitz-test');
    const result = blitz(s, 'Alaska', 'Kamchatka', rng);
    // Either Kamchatka is captured or Alaska has 1 army
    const alaskaArmies = result.next.territories['Alaska']!.armies;
    const kamOwner = result.next.territories['Kamchatka']!.owner;
    expect(alaskaArmies === 1 || kamOwner === '0').toBe(true);
  });
});
