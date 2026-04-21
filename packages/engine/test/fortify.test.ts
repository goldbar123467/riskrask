import { describe, expect, test } from 'bun:test';
import { canFortify, doFortify } from '../src/fortify';
import { createInitialState } from '../src/setup';
import type { GameState } from '../src/types';

const PLAYERS = [
  { id: '0' as const, name: 'Alice', color: '#dc2626', isAI: false },
  { id: '1' as const, name: 'Bob', color: '#2563eb', isAI: false },
  { id: '2' as const, name: 'Carol', color: '#059669', isAI: false },
];

function makeState(): GameState {
  const s = createInitialState({ seed: 'fortify-test', players: PLAYERS });
  const territories = { ...s.territories };
  // Player 0 owns Alaska (5), Northwest Territory (3), Alberta (2)
  // Player 1 owns Kamchatka (3)
  territories.Alaska = { ...territories.Alaska!, owner: '0', armies: 5 };
  territories['Northwest Territory'] = {
    ...territories['Northwest Territory']!,
    owner: '0',
    armies: 3,
  };
  territories.Alberta = { ...territories.Alberta!, owner: '0', armies: 2 };
  territories.Kamchatka = { ...territories.Kamchatka!, owner: '1', armies: 3 };
  return { ...s, phase: 'fortify', territories };
}

describe('canFortify (default = adjacent)', () => {
  test('valid: adjacent, both owned, src > 1', () => {
    const s = makeState();
    expect(canFortify(s, 'Alaska', 'Northwest Territory', '0')).toBe(true);
  });

  test('invalid: not owned by player', () => {
    const s = makeState();
    expect(canFortify(s, 'Alaska', 'Kamchatka', '0')).toBe(false);
  });

  test('invalid: src has only 1 army', () => {
    const s = makeState();
    const territories = { ...s.territories };
    territories.Alaska = { ...territories.Alaska!, armies: 1 };
    expect(canFortify({ ...s, territories }, 'Alaska', 'Northwest Territory', '0')).toBe(false);
  });

  test('valid: connected through owned chain', () => {
    // Alaska → Northwest Territory → Alberta (connected through owned)
    const s = makeState();
    expect(canFortify(s, 'Alaska', 'Alberta', '0')).toBe(true);
  });

  test('invalid: not connected through owned territories', () => {
    // Brazil → Argentina are adjacent, but if player doesn't own one of them
    const s = makeState();
    // Neither Brazil nor Argentina is owned by player 0 in this test
    expect(canFortify(s, 'Brazil', 'Argentina', '0')).toBe(false);
  });

  test('invalid: src equals tgt', () => {
    const s = makeState();
    expect(canFortify(s, 'Alaska', 'Alaska', '0')).toBe(false);
  });

  test('default is adjacent when state.fortifyRule is undefined', () => {
    // Alaska owns→ NT owns→ Ontario owns: a 3-hop chain where Alaska and
    // Ontario are NOT directly adjacent. Should be rejected under default
    // even when fortifyRule is explicitly absent (legacy saves).
    const base = makeState();
    const territories = {
      ...base.territories,
      Ontario: { ...base.territories.Ontario!, owner: '0' as const, armies: 2 },
    };
    const { fortifyRule: _dropped, ...rest } = base;
    const s: GameState = { ...rest, territories };
    expect(s.fortifyRule).toBeUndefined();
    expect(canFortify(s, 'Alaska', 'Ontario', '0')).toBe(false);
  });
});

describe('canFortify (fortifyRule = connected)', () => {
  test('valid: non-adjacent, reachable through owned chain', () => {
    // Alaska ─ NT ─ Ontario: Alaska and Ontario are not directly adjacent,
    // but the chain is all owned by player 0.
    const base = makeState();
    const territories = {
      ...base.territories,
      Ontario: { ...base.territories.Ontario!, owner: '0' as const, armies: 2 },
    };
    const s: GameState = { ...base, fortifyRule: 'connected', territories };
    expect(canFortify(s, 'Alaska', 'Ontario', '0')).toBe(true);
  });

  test('invalid: chain is broken by a non-owned territory', () => {
    // Player 0 holds only Alaska and Greenland; every land bridge between
    // them (NT, Alberta) is held by player 1, so no owned chain exists.
    const base = makeState();
    const territories = {
      ...base.territories,
      'Northwest Territory': {
        ...base.territories['Northwest Territory']!,
        owner: '1' as const,
      },
      Alberta: { ...base.territories.Alberta!, owner: '1' as const },
      Greenland: { ...base.territories.Greenland!, owner: '0' as const, armies: 2 },
    };
    const s: GameState = { ...base, fortifyRule: 'connected', territories };
    expect(canFortify(s, 'Alaska', 'Greenland', '0')).toBe(false);
  });

  test('invalid: src has only 1 army even if chain exists', () => {
    const base = makeState();
    const territories = {
      ...base.territories,
      Alaska: { ...base.territories.Alaska!, armies: 1 },
    };
    const s: GameState = { ...base, fortifyRule: 'connected', territories };
    expect(canFortify(s, 'Alaska', 'Alberta', '0')).toBe(false);
  });
});

describe('createInitialState fortifyRule', () => {
  test('defaults to adjacent when omitted', () => {
    const s = createInitialState({ seed: 'fr-default', players: PLAYERS });
    expect(s.fortifyRule).toBe('adjacent');
  });

  test('honours explicit connected', () => {
    const s = createInitialState({
      seed: 'fr-connected',
      players: PLAYERS,
      fortifyRule: 'connected',
    });
    expect(s.fortifyRule).toBe('connected');
  });
});

describe('doFortify', () => {
  test('moves armies from source to target', () => {
    const s = makeState();
    const result = doFortify(s, 'Alaska', 'Northwest Territory', 2);
    expect(result.next.territories.Alaska!.armies).toBe(3);
    expect(result.next.territories['Northwest Territory']!.armies).toBe(5);
  });

  test('throws on invalid count (0)', () => {
    const s = makeState();
    expect(() => doFortify(s, 'Alaska', 'Northwest Territory', 0)).toThrow();
  });

  test('throws when count >= src armies', () => {
    const s = makeState();
    expect(() => doFortify(s, 'Alaska', 'Northwest Territory', 5)).toThrow();
  });

  test('throws when player does not own src', () => {
    const s = makeState();
    expect(() => doFortify(s, 'Kamchatka', 'Mongolia', 1)).toThrow();
  });
});
