import { describe, expect, test } from 'bun:test';
import { Arch } from '../src/arch.js';
import { createPersonaState } from '../src/persona.js';
import { Regret, expectedLoss, resetRegret, updateRegret } from '../src/regret.js';

describe('Regret', () => {
  test('expectedLoss table matches v2 verbatim', () => {
    const cases: [number, number, number, number][] = [
      [1, 1, 0.583, 0.417],
      [2, 1, 0.421, 0.579],
      [3, 1, 0.340, 0.660],
      [1, 2, 0.745, 0.255],
      [2, 2, 0.896, 1.104],
      [3, 2, 0.742, 1.258],
    ];
    for (const [atk, def, expAtk, expDef] of cases) {
      const r = expectedLoss(atk, def);
      expect(r.atkLoss).toBeCloseTo(expAtk, 3);
      expect(r.defLoss).toBeCloseTo(expDef, 3);
    }
  });

  test('updateRegret adjusts hopelessPenalty for bad result', () => {
    const arch = Arch.get('napoleon')!;
    const ps = createPersonaState(arch);
    const before = ps.runtimeWeights.attack.hopelessPenalty;
    // Actual atk loss >> expected (bad luck)
    const updated = updateRegret(ps, arch, 3, 2, 3.0, 0.5);
    expect(updated.runtimeWeights.attack.hopelessPenalty).not.toBe(before);
  });

  test('updateRegret is pure — does not mutate input', () => {
    const arch = Arch.get('napoleon')!;
    const ps = createPersonaState(arch);
    const orig = JSON.stringify(ps);
    updateRegret(ps, arch, 3, 2, 1.0, 1.0);
    expect(JSON.stringify(ps)).toBe(orig);
  });

  test('resetRegret restores baseline weights', () => {
    const arch = Arch.get('napoleon')!;
    let ps = createPersonaState(arch);
    ps = updateRegret(ps, arch, 3, 2, 3.0, 0.0);
    ps = resetRegret(ps, arch);
    expect(ps.runtimeWeights.attack.hopelessPenalty).toBeCloseTo(arch.weights.attack.hopelessPenalty);
    expect(ps.regretTempAccum).toBe(0);
  });

  test('hopelessPenalty is clamped within [base*0.7, base*1.6]', () => {
    const arch = Arch.get('napoleon')!;
    let ps = createPersonaState(arch);
    const base = arch.weights.attack.hopelessPenalty;
    for (let i = 0; i < 100; i++) {
      ps = updateRegret(ps, arch, 1, 2, 3.0, 0.0);
    }
    expect(ps.runtimeWeights.attack.hopelessPenalty).toBeGreaterThanOrEqual(base * 0.7 - 0.001);
    expect(ps.runtimeWeights.attack.hopelessPenalty).toBeLessThanOrEqual(base * 1.6 + 0.001);
  });
});
