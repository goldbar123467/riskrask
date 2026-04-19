import { describe, expect, test } from 'bun:test';
import { createRng } from '@riskrask/engine';
import { Arch } from '../src/arch.js';
import { Persona, createPersonaState, softmaxPick } from '../src/persona.js';
import { buildMidgameState, P0 } from './helpers.js';

describe('Persona', () => {
  test('scoreReinforce returns a number for each owned territory', () => {
    const state = buildMidgameState();
    const arch = Arch.get('napoleon')!;
    const ps = createPersonaState(arch);
    const owned = Object.entries(state.territories)
      .filter(([, t]) => t.owner === P0)
      .map(([name]) => name);
    for (const name of owned) {
      const score = Persona.scoreReinforce(state, name, P0, ps);
      expect(typeof score).toBe('number');
      expect(isFinite(score)).toBe(true);
    }
  });

  test('scoreAttack is lower when attacker < defender armies', () => {
    const state = buildMidgameState();
    // Find a territory where P0 has fewer armies than an adjacent enemy
    const owned = Object.entries(state.territories).filter(([, t]) => t.owner === P0);
    let foundDisadvantaged = false;
    for (const [srcName, srcT] of owned) {
      for (const adj of srcT.adj) {
        const adjT = state.territories[adj];
        if (adjT?.owner !== P0 && adjT && adjT.armies > srcT.armies) {
          const ps = createPersonaState(Arch.get('dilettante')!);
          const score = Persona.scoreAttack(state, srcName, adj, P0, ps);
          expect(score).toBeLessThan(0); // hopelessPenalty should dominate
          foundDisadvantaged = true;
          break;
        }
      }
      if (foundDisadvantaged) break;
    }
    // If no disadvantaged position found, just skip (valid for some game seeds)
  });

  test('softmaxPick is deterministic given same seed', () => {
    const options = [
      { item: 'a', score: 10 },
      { item: 'b', score: 8 },
      { item: 'c', score: 5 },
    ];
    const rng1 = createRng('det-test');
    const rng2 = createRng('det-test');
    const r1 = softmaxPick(options, 1.0, rng1);
    const r2 = softmaxPick(options, 1.0, rng2);
    expect(r1?.item).toBe(r2?.item);
  });

  test('softmaxPick with temperature=0.1 almost always picks highest score', () => {
    const options = [
      { item: 'winner', score: 100 },
      { item: 'loser', score: 0 },
    ];
    let winCount = 0;
    for (let seed = 0; seed < 50; seed++) {
      const rng = createRng(`t${seed}`);
      const r = softmaxPick(options, 0.1, rng);
      if (r?.item === 'winner') winCount++;
    }
    expect(winCount).toBeGreaterThan(45); // near-deterministic at very low temperature
  });

  test('Persona.pick with same seed produces same result', () => {
    const state = buildMidgameState();
    const arch = Arch.get('napoleon')!;
    const ps = createPersonaState(arch);
    const owned = Object.keys(state.territories).filter((n) => state.territories[n]?.owner === P0);
    const options = owned.map((n) => ({
      item: n,
      score: Persona.scoreReinforce(state, n, P0, ps),
    }));

    const rng1 = createRng('pick-seed');
    const rng2 = createRng('pick-seed');
    const r1 = Persona.pick(options, ps, arch, 0, rng1);
    const r2 = Persona.pick(options, ps, arch, 0, rng2);
    expect(r1?.item).toBe(r2?.item);
  });

  test('scoreFortify returns array', () => {
    const state = buildMidgameState();
    const scores = Persona.scoreFortify(state, P0);
    expect(Array.isArray(scores)).toBe(true);
  });
});
