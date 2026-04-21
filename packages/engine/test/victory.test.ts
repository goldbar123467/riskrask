import { describe, expect, test } from 'bun:test';
import { createInitialState } from '../src/setup';
import type { GameState, PlayerState } from '../src/types';
import { checkElimination, checkVictory, transferCardsOnElimination } from '../src/victory';

const PLAYERS = [
  { id: '0' as const, name: 'Alice', color: '#dc2626', isAI: false },
  { id: '1' as const, name: 'Bob', color: '#2563eb', isAI: false },
  { id: '2' as const, name: 'Carol', color: '#059669', isAI: false },
];

function makeState(overrides?: Partial<GameState>): GameState {
  return {
    ...createInitialState({ seed: 'victory-test', players: PLAYERS }),
    ...overrides,
  };
}

describe('checkElimination', () => {
  test('player is eliminated when they own no territories', () => {
    const s = makeState();
    // Player 1 owns nothing (all territories default to null owner)
    const result = checkElimination(s, '1');
    expect(result).toBe(true);
  });

  test('player is not eliminated when they own territories', () => {
    const s = makeState();
    const territories = { ...s.territories };
    territories.Alaska = { ...territories.Alaska!, owner: '1', armies: 1 };
    const result = checkElimination({ ...s, territories }, '1');
    expect(result).toBe(false);
  });
});

describe('checkVictory', () => {
  test('returns winner when only one non-eliminated player', () => {
    const s = makeState();
    const players: PlayerState[] = s.players.map((p) => ({
      ...p,
      eliminated: p.id !== '0',
    }));
    const result = checkVictory({ ...s, players });
    expect(result).toBe('0');
  });

  test('returns null when multiple active players', () => {
    const s = makeState();
    expect(checkVictory(s)).toBeNull();
  });

  test('returns winner when one player owns all territories', () => {
    const s = makeState();
    const territories = { ...s.territories };
    for (const name of Object.keys(territories)) {
      territories[name] = { ...territories[name]!, owner: '0', armies: 1 };
    }
    const result = checkVictory({ ...s, territories });
    expect(result).toBe('0');
  });

  test('two-player variant: Neutral is ignored when counting contenders', () => {
    const PLAYERS_2 = [
      { id: '0' as const, name: 'Alice', color: '#dc2626', isAI: false },
      { id: '1' as const, name: 'Bob', color: '#2563eb', isAI: true },
    ];
    const s = createInitialState({ seed: '2p-victory', players: PLAYERS_2 });
    // Alice alone active; Bob eliminated; Neutral alive (not eliminated).
    const players: PlayerState[] = s.players.map((p) => {
      if (p.id === '1') return { ...p, eliminated: true };
      return p;
    });
    expect(checkVictory({ ...s, players })).toBe('0');
  });
});

describe('transferCardsOnElimination', () => {
  test('transfers cards from eliminated player to attacker', () => {
    const s = makeState();
    const card = { type: 'Infantry' as const, territory: 'Alaska' as const };
    const players: PlayerState[] = s.players.map((p) => {
      if (p.id === '1') return { ...p, cards: [card], eliminated: true };
      return p;
    });
    const result = transferCardsOnElimination({ ...s, players }, '0', '1');
    const attacker = result.players.find((p) => p.id === '0');
    const defender = result.players.find((p) => p.id === '1');
    expect(attacker?.cards).toHaveLength(1);
    expect(attacker?.cards[0]).toEqual(card);
    expect(defender?.cards).toHaveLength(0);
  });

  test('sets pendingForcedTrade when attacker reaches 5+ cards', () => {
    const s = makeState();
    const cards = Array.from({ length: 5 }, (_, i) => ({
      type: 'Infantry' as const,
      territory: `t${i}` as string,
    }));
    const players: PlayerState[] = s.players.map((p) => {
      if (p.id === '1') return { ...p, cards, eliminated: true };
      return p;
    });
    const result = transferCardsOnElimination({ ...s, players }, '0', '1');
    expect(result.pendingForcedTrade).toBeDefined();
    expect(result.pendingForcedTrade?.playerId).toBe('0');
  });
});
