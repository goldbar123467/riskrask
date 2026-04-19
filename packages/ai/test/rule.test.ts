import { describe, expect, test } from 'bun:test';
import { createRng } from '@riskrask/engine';
import { Arch } from '../src/arch.js';
import { Rule } from '../src/rule.js';
import { buildMidgameState } from './helpers.js';

describe('Rule', () => {
  test('reinforceBonus returns 0 for null arch', () => {
    expect(Rule.reinforceBonus(null, 0)).toBe(0);
  });

  test('reinforceBonus returns 0 for dilettante (no ruleMods)', () => {
    expect(Rule.reinforceBonus(Arch.get('dilettante'), 0)).toBe(0);
  });

  test('reinforceBonus for vengeful starts at +1', () => {
    const arch = Arch.get('vengeful')!;
    expect(Rule.reinforceBonus(arch, 0)).toBe(1);
  });

  test('reinforceBonus for vengeful decreases with attacks last turn', () => {
    const arch = Arch.get('vengeful')!;
    expect(Rule.reinforceBonus(arch, 3)).toBe(1 - 3);
  });

  test('canAttack returns true for dilettante always', () => {
    const state = buildMidgameState();
    const owned = Object.keys(state.territories).filter(
      (n) => state.territories[n]?.owner === 'p0',
    );
    if (owned.length === 0) return;
    expect(Rule.canAttack(state, Arch.get('dilettante'), owned[0]!)).toBe(true);
  });

  test('canAttack returns false for shogun when armies < 4', () => {
    const state = buildMidgameState();
    const arch = Arch.get('shogun')!;
    // Find a territory with < 4 armies owned by p0
    const lowArmy = Object.entries(state.territories).find(
      ([, t]) => t.owner === 'p0' && t.armies < 4,
    )?.[0];
    if (!lowArmy) return; // no suitable territory found
    expect(Rule.canAttack(state, arch, lowArmy)).toBe(false);
  });

  test('canAttack returns false for hermit on turn 0', () => {
    const state = buildMidgameState(); // turn 0
    const arch = Arch.get('hermit')!;
    const owned = Object.keys(state.territories).filter(
      (n) => state.territories[n]?.owner === 'p0',
    );
    if (owned.length === 0) return;
    expect(Rule.canAttack(state, arch, owned[0]!)).toBe(false);
  });

  test('rerollAtkDie returns same length array', () => {
    const arch = Arch.get('prophet')!;
    const rng = createRng('reroll-test');
    const result = Rule.rerollAtkDie(arch, [3, 2, 1], [5, 4], rng);
    expect(result.length).toBe(3);
  });

  test('rerollAtkDie does not reroll if no arch rule', () => {
    const rng = createRng('noreroll');
    const dice = [3, 2, 1];
    const result = Rule.rerollAtkDie(Arch.get('napoleon'), dice, [5, 4], rng);
    expect(result).toEqual([3, 2, 1]);
  });
});
