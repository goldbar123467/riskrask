import { describe, expect, test } from 'bun:test';
import { Arch, ARCH_IDS } from '../src/arch.js';

describe('Arch catalog', () => {
  test('list() returns 9 archetypes', () => {
    expect(Arch.list()).toHaveLength(9);
  });

  test('ids contains all archetype ids', () => {
    expect(Arch.ids).toHaveLength(9);
  });

  test('each archetype has required fields', () => {
    for (const arch of Arch.list()) {
      expect(arch.id).toBeTruthy();
      expect(arch.name).toBeTruthy();
      expect(arch.era).toBeTruthy();
      expect(arch.color).toMatch(/^#[0-9a-f]{6}$/);
      expect(arch.description).toBeTruthy();
      expect(arch.temperature).toBeGreaterThan(0);
      expect(arch.mistakeRate).toBeGreaterThanOrEqual(0);
      expect(typeof arch.weights.reinforce.adjEnemies).toBe('number');
      expect(typeof arch.weights.attack.completeContinent).toBe('number');
    }
  });

  test('Arch.get returns correct archetype', () => {
    const a = Arch.get('napoleon');
    expect(a).not.toBeNull();
    expect(a?.name).toBe('Bonaparte');
    expect(a?.era).toBe('French Empire, 1809');
  });

  test('Arch.get returns null for unknown id', () => {
    expect(Arch.get('unknown-arch')).toBeNull();
  });

  test('each archetype in ids resolves via get()', () => {
    for (const id of ARCH_IDS) {
      const arch = Arch.get(id);
      expect(arch).not.toBeNull();
      expect(arch?.id).toBe(id);
    }
  });

  test('dilettante has all-ones reinforce weights (baseline)', () => {
    const d = Arch.get('dilettante')!;
    expect(d.weights.reinforce.adjEnemies).toBe(1);
    expect(d.weights.reinforce.adjFriendly).toBe(1);
    expect(d.weights.attack.completeContinent).toBe(1);
  });

  test('napoleon has openingBook europe-blitz', () => {
    expect(Arch.get('napoleon')?.openingBook).toBe('europe-blitz');
  });

  test('vengeful has grudge weight 2.5', () => {
    expect(Arch.get('vengeful')?.weights.grudge).toBe(2.5);
  });

  test('shogun has ruleMod minAttackStack = 4', () => {
    expect(Arch.get('shogun')?.ruleMods?.minAttackStack).toBe(4);
  });

  test('hermit has ruleMod noAttackBeforeTurn = 5', () => {
    expect(Arch.get('hermit')?.ruleMods?.noAttackBeforeTurn).toBe(5);
  });

  test('prophet has ruleMod rerollOneLoss = true', () => {
    expect(Arch.get('prophet')?.ruleMods?.rerollOneLoss).toBe(true);
  });
});
