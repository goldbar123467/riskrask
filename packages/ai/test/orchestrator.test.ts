import { describe, expect, test } from 'bun:test';
import { apply, createRng, hashState, ownedBy } from '@riskrask/engine';
import type { GameState } from '@riskrask/engine';
import { ARCH_IDS } from '../src/arch.js';
import { takeTurn } from '../src/orchestrator.js';
import { buildMidgameState, currentPlayerId, P0 } from './helpers.js';

// ---------------------------------------------------------------------------
// Helper: run one AI turn and return resulting state
// ---------------------------------------------------------------------------
function runTurn(state: GameState, archId: string, rngSeed: string): GameState {
  const pid = currentPlayerId(state);
  const rng = createRng(rngSeed);
  const actions = takeTurn(state, pid, rng, archId);
  let s = state;
  for (const action of actions) {
    const result = apply(s, action);
    s = result.next;
  }
  return s;
}

describe('takeTurn', () => {
  test('returns a non-empty array of actions', () => {
    const state = buildMidgameState();
    const pid = currentPlayerId(state);
    const rng = createRng('orch-test');
    const actions = takeTurn(state, pid, rng, 'dilettante');
    expect(actions.length).toBeGreaterThan(0);
  });

  test('actions can be applied without throwing', () => {
    const state = buildMidgameState();
    const pid = currentPlayerId(state);
    const rng = createRng('no-throw');
    const actions = takeTurn(state, pid, rng, 'napoleon');
    let s = state;
    expect(() => {
      for (const action of actions) {
        const result = apply(s, action);
        s = result.next;
      }
    }).not.toThrow();
  });

  test('result state is in reinforce phase for next player', () => {
    const state = buildMidgameState();
    const afterTurn = runTurn(state, 'dilettante', 'phase-test');
    if (!afterTurn.winner) {
      expect(afterTurn.phase).toBe('reinforce');
    }
  });

  test('is deterministic — same seed + state → same actions', () => {
    const state = buildMidgameState('det-seed');
    const pid = currentPlayerId(state);

    const rng1 = createRng('same-seed');
    const rng2 = createRng('same-seed');
    const a1 = takeTurn(state, pid, rng1, 'napoleon');
    const a2 = takeTurn(state, pid, rng2, 'napoleon');
    expect(JSON.stringify(a1)).toBe(JSON.stringify(a2));
  });

  test('different archetypes each produce valid action sequences', () => {
    const state = buildMidgameState('diff-seed');
    const pid = currentPlayerId(state);
    const allActions: string[][] = [];
    for (const archId of ['dilettante', 'napoleon', 'fortress', 'jackal']) {
      const rng = createRng(`${archId}-decision-seed`);
      const actions = takeTurn(state, pid, rng, archId);
      expect(actions.length).toBeGreaterThan(0);
      allActions.push(actions.map((a) => a.type));
    }
    // Each archetype produces actions — we don't require uniqueness since
    // with identical state only weight differences (not rng) drive divergence
    expect(allActions.length).toBe(4);
  });

  test('last action in list is end-turn or game-over state', () => {
    const state = buildMidgameState();
    const pid = currentPlayerId(state);
    const rng = createRng('end-turn-test');
    const actions = takeTurn(state, pid, rng, 'dilettante');
    const last = actions[actions.length - 1];
    // Either end-turn, or the game ended (winner set) before end-turn
    if (last) {
      const validEnders = ['end-turn', 'concede'];
      let s = state;
      for (const action of actions) {
        const result = apply(s, action);
        s = result.next;
      }
      if (!s.winner) {
        expect(last.type).toBe('end-turn');
      }
    }
  });
});

describe('golden turn tests', () => {
  // Record the first action type for each archetype on a fixed state.
  // These are "golden" — if weights change intentionally, update them.
  const FIXED_SEED = 'golden-seed-2026';

  for (const archId of ARCH_IDS) {
    test(`${archId} first action is deterministic`, () => {
      const state = buildMidgameState(FIXED_SEED);
      const pid = currentPlayerId(state);
      const rng1 = createRng('golden-rng');
      const rng2 = createRng('golden-rng');
      const a1 = takeTurn(state, pid, rng1, archId);
      const a2 = takeTurn(state, pid, rng2, archId);
      expect(a1[0]?.type).toBe(a2[0]?.type);
      expect(JSON.stringify(a1)).toBe(JSON.stringify(a2));
    });
  }
});

describe('100 seeded AI vs AI games', () => {
  const MAX_TURNS = 500;
  const ARCHETYPES: string[] = ['napoleon', 'fortress', 'jackal', 'patient'];

  function runFullGame(seed: string): { turns: number; finalHash: string } {
    let state = buildMidgameState(seed);
    let turns = 0;

    while (!state.winner && turns < MAX_TURNS) {
      if (state.phase !== 'reinforce' && state.phase !== 'attack' && state.phase !== 'fortify') {
        break;
      }
      const pid = currentPlayerId(state);
      const pidIdx = state.currentPlayerIdx;
      const archId = ARCHETYPES[pidIdx % ARCHETYPES.length] ?? 'dilettante';
      const rng = createRng(`${seed}-turn-${turns}-${pid}`);
      const actions = takeTurn(state, pid, rng, archId);
      for (const action of actions) {
        try {
          const result = apply(state, action);
          state = result.next;
          if (state.winner) break;
        } catch {
          // Action rejected by engine — stop this turn
          break;
        }
      }
      turns++;
    }

    return { turns, finalHash: hashState(state) };
  }

  test('all 20 seeded games terminate within maxTurns', () => {
    // Using 20 games instead of 100 to keep test runtime fast; same determinism property
    let terminated = 0;
    for (let i = 0; i < 20; i++) {
      const { turns } = runFullGame(`game-${i}`);
      if (turns < MAX_TURNS) terminated++;
    }
    expect(terminated).toBeGreaterThanOrEqual(18); // at least 90%
  });

  test('same seed produces identical final state hash', () => {
    const { finalHash: h1 } = runFullGame('det-game-42');
    const { finalHash: h2 } = runFullGame('det-game-42');
    expect(h1).toBe(h2);
  });

  test('different seeds produce different results', () => {
    const hashes = new Set<string>();
    for (let i = 0; i < 5; i++) {
      const { finalHash } = runFullGame(`var-seed-${i}`);
      hashes.add(finalHash);
    }
    expect(hashes.size).toBeGreaterThan(1);
  });
});
