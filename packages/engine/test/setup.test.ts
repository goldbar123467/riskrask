import { describe, expect, test } from 'bun:test';
import { BOARD_TERRITORY_COUNT, NEUTRAL_ID, STARTING_ARMIES } from '../src/board';
import { createInitialState } from '../src/setup';

const PLAYERS_3 = [
  { id: '0' as const, name: 'Alice', color: '#dc2626', isAI: false },
  { id: '1' as const, name: 'Bob', color: '#2563eb', isAI: false },
  { id: '2' as const, name: 'Carol', color: '#059669', isAI: false },
];

const PLAYERS_2 = [
  { id: '0' as const, name: 'Alice', color: '#dc2626', isAI: false },
  { id: '1' as const, name: 'Bob', color: '#2563eb', isAI: true },
];

describe('createInitialState', () => {
  test('all 42 territories start unowned with 0 armies', () => {
    const s = createInitialState({ seed: 'test', players: PLAYERS_3 });
    const terrNames = Object.keys(s.territories);
    expect(terrNames).toHaveLength(BOARD_TERRITORY_COUNT);
    for (const name of terrNames) {
      const t = s.territories[name];
      expect(t).toBeDefined();
      if (!t) continue;
      expect(t.owner).toBeNull();
      expect(t.armies).toBe(0);
    }
  });

  test('phase is setup-claim', () => {
    const s = createInitialState({ seed: 'test', players: PLAYERS_3 });
    expect(s.phase).toBe('setup-claim');
  });

  test('turn is 0 and currentPlayerIdx is 0', () => {
    const s = createInitialState({ seed: 'test', players: PLAYERS_3 });
    expect(s.turn).toBe(0);
    expect(s.currentPlayerIdx).toBe(0);
  });

  test('each player starts with STARTING_ARMIES reserves', () => {
    const s = createInitialState({ seed: 'test', players: PLAYERS_3 });
    const expected = STARTING_ARMIES[3];
    if (expected === undefined) throw new Error('STARTING_ARMIES[3] undefined');
    for (const p of s.players) {
      expect(p.reserves).toBe(expected);
    }
  });

  test('deck has 44 cards (42 territory + 2 wild)', () => {
    const s = createInitialState({ seed: 'test', players: PLAYERS_3 });
    expect(s.deck.length + s.discard.length).toBe(44);
  });

  test('same seed produces same deck order', () => {
    const a = createInitialState({ seed: 'same', players: PLAYERS_3 });
    const b = createInitialState({ seed: 'same', players: PLAYERS_3 });
    expect(a.deck.map((c) => c.territory)).toEqual(b.deck.map((c) => c.territory));
  });

  test('schemaVersion is 1', () => {
    const s = createInitialState({ seed: 'test', players: PLAYERS_3 });
    expect(s.schemaVersion).toBe(1);
  });
});

describe('createInitialState — two-player Neutral variant (§3.5)', () => {
  test('2 humans become 3 players with a synthesised Neutral', () => {
    const s = createInitialState({ seed: '2p', players: PLAYERS_2 });
    expect(s.players).toHaveLength(3);
    const neutral = s.players.find((p) => p.isNeutral);
    expect(neutral?.id).toBe(NEUTRAL_ID);
    expect(neutral?.name).toBe('Neutral');
  });

  test('each participant (including Neutral) starts with 40 reserves', () => {
    const s = createInitialState({ seed: '2p', players: PLAYERS_2 });
    expect(STARTING_ARMIES[2]).toBe(40);
    for (const p of s.players) {
      expect(p.reserves).toBe(40);
    }
  });

  test('wild cards are removed from the deck in the 2-player variant', () => {
    const s = createInitialState({ seed: '2p', players: PLAYERS_2 });
    expect(s.deck.length + s.discard.length).toBe(BOARD_TERRITORY_COUNT);
    for (const card of s.deck) {
      expect(card.type).not.toBe('Wild');
    }
  });

  test('Neutral has isNeutral: true; humans do not', () => {
    const s = createInitialState({ seed: '2p', players: PLAYERS_2 });
    expect(s.players[0]?.isNeutral).toBeUndefined();
    expect(s.players[1]?.isNeutral).toBeUndefined();
    expect(s.players[2]?.isNeutral).toBe(true);
  });

  test('throws for unsupported player count (1)', () => {
    expect(() =>
      createInitialState({
        seed: 'solo',
        players: [{ id: '0', name: 'Solo', color: '#dc2626', isAI: false }],
      }),
    ).toThrow();
  });

  test('3-player game leaves wild cards in the deck (baseline invariant)', () => {
    const s = createInitialState({ seed: 'three', players: PLAYERS_3 });
    const wilds = s.deck.filter((c) => c.type === 'Wild').length;
    expect(wilds).toBe(2);
  });
});

describe('createInitialState fortifyRule validation', () => {
  test('rejects an unknown fortifyRule value', () => {
    expect(() =>
      createInitialState({
        seed: 'x',
        players: [
          { id: 'p1', name: 'P1', color: '#f00', isAI: false },
          { id: 'p2', name: 'P2', color: '#0f0', isAI: false },
          { id: 'p3', name: 'P3', color: '#00f', isAI: false },
        ],
        // deliberately invalid — must throw.
        fortifyRule: 'freeform' as any,
      }),
    ).toThrow(/fortifyRule/i);
  });
  test('accepts adjacent', () => {
    const s = createInitialState({
      seed: 'x',
      players: [
        { id: 'p1', name: 'P1', color: '#f00', isAI: false },
        { id: 'p2', name: 'P2', color: '#0f0', isAI: false },
        { id: 'p3', name: 'P3', color: '#00f', isAI: false },
      ],
      fortifyRule: 'adjacent',
    });
    expect(s.fortifyRule).toBe('adjacent');
  });
  test('accepts connected', () => {
    const s = createInitialState({
      seed: 'x',
      players: [
        { id: 'p1', name: 'P1', color: '#f00', isAI: false },
        { id: 'p2', name: 'P2', color: '#0f0', isAI: false },
        { id: 'p3', name: 'P3', color: '#00f', isAI: false },
      ],
      fortifyRule: 'connected',
    });
    expect(s.fortifyRule).toBe('connected');
  });
});
