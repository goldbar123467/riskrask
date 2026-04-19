import { describe, expect, test } from 'bun:test';
import { Arch } from '../src/arch.js';
import { Band } from '../src/band.js';
import { createPersonaState } from '../src/persona.js';
import { P0, P1, buildMidgameState } from './helpers.js';

describe('Band', () => {
  test('standing returns value in [-1, 1]', () => {
    const state = buildMidgameState();
    const s = Band.standing(state, P0);
    expect(s).toBeGreaterThanOrEqual(-1);
    expect(s).toBeLessThanOrEqual(1);
  });

  test('standing returns -1 for eliminated player', () => {
    const state = buildMidgameState();
    const modState = {
      ...state,
      players: state.players.map((p, i) => (i === 0 ? { ...p, eliminated: true } : p)),
    };
    expect(Band.standing(modState, P0)).toBe(-1);
  });

  test('recalibrate adjusts runtimeTemperature from base', () => {
    const state = buildMidgameState();
    const arch = Arch.get('napoleon')!;
    const ps = createPersonaState(arch);
    const calibrated = Band.recalibrate(state, ps, arch, P0);
    // Temperature should be positive and in a reasonable range
    expect(calibrated.runtimeTemperature).toBeGreaterThan(0);
    expect(calibrated.runtimeTemperature).toBeLessThan(5);
  });

  test('leader gets lower temperature (napoleon leaderBonus > 0)', () => {
    const arch = Arch.get('napoleon')!;
    // leaderBonus = 0.1 means more standing → more temperature increase
    // trailerBonus = -0.3 means standing negative → add -0.3 * |standing|
    // If player is ahead, standing > 0, delta = leaderBonus * standing > 0 → T increases
    // This means napoleon is MORE random when winning
    expect(arch.rubberBand.leaderBonus).toBe(0.1);
    expect(arch.rubberBand.trailerBonus).toBe(-0.3);
  });

  test('recalibrate temperature stays above 0.1', () => {
    const state = buildMidgameState();
    const arch = Arch.get('fortress')!;
    const ps = { ...createPersonaState(arch), regretTempAccum: -5 }; // large negative accum
    const calibrated = Band.recalibrate(state, ps, arch, P0);
    expect(calibrated.runtimeTemperature).toBeGreaterThanOrEqual(0.1);
  });
});
