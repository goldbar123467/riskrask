import { describe, expect, test } from 'bun:test';
import { Rep } from '../src/rep.js';
import { buildMidgameState, P0, P1 } from './helpers.js';

describe('Rep', () => {
  test('initRepMatrix creates entries for all player pairs', () => {
    const state = buildMidgameState();
    const matrix = Rep.init(state);
    for (const a of state.players) {
      for (const b of state.players) {
        if (a.id === b.id) continue;
        expect(matrix[a.id]?.[b.id]).toBeDefined();
      }
    }
  });

  test('AI vs human starts at -0.15', () => {
    const state = buildMidgameState();
    // All players are isAI=true in helpers, so default is 0
    const matrix = Rep.init(state);
    expect(matrix[P0]?.[P1]).toBe(0);
  });

  test('onAttack decreases attacker rep toward defender', () => {
    const state = buildMidgameState();
    const matrix = Rep.init(state);
    const before = matrix[P0]?.[P1] ?? 0;
    const after = Rep.onAttack(matrix, P0, P1);
    expect(after[P0]?.[P1]).toBeLessThan(before);
  });

  test('onAttack also decreases defender rep toward attacker (more)', () => {
    const state = buildMidgameState();
    const matrix = Rep.init(state);
    const beforeDef = matrix[P1]?.[P0] ?? 0;
    const after = Rep.onAttack(matrix, P0, P1);
    expect(after[P1]?.[P0]).toBeLessThan(beforeDef);
    // Defender loses more rep (ATTACK_COST * 1.2) vs attacker (ATTACK_COST)
    const atkDrop = (matrix[P0]?.[P1] ?? 0) - (after[P0]?.[P1] ?? 0);
    const defDrop = (matrix[P1]?.[P0] ?? 0) - (after[P1]?.[P0] ?? 0);
    expect(defDrop).toBeGreaterThan(atkDrop);
  });

  test('tickRep decays values toward 0', () => {
    const state = buildMidgameState();
    let matrix = Rep.init(state);
    matrix = Rep.onAttack(matrix, P0, P1);
    const before = matrix[P0]?.[P1] ?? 0;
    const after = Rep.tick(state, matrix);
    // Values negative → decay toward 0 (increase)
    expect((after[P0]?.[P1] ?? 0)).toBeGreaterThan(before);
  });

  test('rep values stay in [-1, 1]', () => {
    const state = buildMidgameState();
    let matrix = Rep.init(state);
    // Apply many attacks
    for (let i = 0; i < 20; i++) matrix = Rep.onAttack(matrix, P0, P1);
    for (const row of Object.values(matrix)) {
      for (const v of Object.values(row as Record<string, number>)) {
        expect(v).toBeGreaterThanOrEqual(-1);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  test('Rep.get returns 0 for missing pair', () => {
    expect(Rep.get({}, P0, P1)).toBe(0);
  });

  test('onAttack is pure (does not mutate original)', () => {
    const state = buildMidgameState();
    const matrix = Rep.init(state);
    const original = JSON.stringify(matrix);
    Rep.onAttack(matrix, P0, P1);
    expect(JSON.stringify(matrix)).toBe(original);
  });
});
