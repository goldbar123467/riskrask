import { describe, expect, test } from 'bun:test';
import { TERR_ORDER } from '../src/board';
import { EngineError } from '../src/combat';
import { apply } from '../src/reducer';
import { createInitialState } from '../src/setup';
import type { GameState, PlayerState } from '../src/types';

const PLAYERS = [
  { id: '0' as const, name: 'Alice', color: '#dc2626', isAI: false },
  { id: '1' as const, name: 'Bob', color: '#2563eb', isAI: false },
  { id: '2' as const, name: 'Carol', color: '#059669', isAI: false },
];

describe('claim-territory', () => {
  test('player can claim an unclaimed territory in setup-claim', () => {
    const s = createInitialState({ seed: 'reduce-test', players: PLAYERS });
    const { next } = apply(s, { type: 'claim-territory', territory: 'Alaska' });
    expect(next.territories.Alaska!.owner).toBe('0');
    expect(next.territories.Alaska!.armies).toBe(1);
  });

  test('advances turn after claim', () => {
    const s = createInitialState({ seed: 'reduce-test', players: PLAYERS });
    const { next } = apply(s, { type: 'claim-territory', territory: 'Alaska' });
    expect(next.currentPlayerIdx).toBe(1);
  });

  test('throws when territory already claimed', () => {
    const s = createInitialState({ seed: 'reduce-test', players: PLAYERS });
    const { next } = apply(s, { type: 'claim-territory', territory: 'Alaska' });
    expect(() => apply(next, { type: 'claim-territory', territory: 'Alaska' })).toThrow(
      EngineError,
    );
  });

  test('transitions to setup-reinforce after all 42 territories claimed', () => {
    let s = createInitialState({ seed: 'full-claim', players: PLAYERS });
    for (let i = 0; i < TERR_ORDER.length; i++) {
      const name = TERR_ORDER[i]!;
      const result = apply(s, { type: 'claim-territory', territory: name });
      s = result.next;
    }
    expect(s.phase).toBe('setup-reinforce');
  });
});

describe('setup-reinforce', () => {
  test('places 1 army on owned territory, decrements reserves', () => {
    let s = createInitialState({ seed: 'setup-rein', players: PLAYERS });
    // Claim all territories first
    for (const name of TERR_ORDER) {
      s = apply(s, { type: 'claim-territory', territory: name }).next;
    }
    expect(s.phase).toBe('setup-reinforce');
    const p0 = s.players[0]!;
    const initialReserves = p0.reserves;
    const owned = Object.keys(s.territories).find((n) => s.territories[n]?.owner === p0.id)!;
    const { next } = apply(s, { type: 'setup-reinforce', territory: owned });
    expect(next.players[0]!.reserves).toBe(initialReserves - 1);
    expect(next.territories[owned]!.armies).toBe(2);
  });
});

describe('reinforce', () => {
  test('places armies on owned territory', () => {
    const base = createInitialState({ seed: 'rein-test', players: PLAYERS });
    const territories = { ...base.territories };
    // Give p0 all territories and put in reinforce phase
    for (const n of TERR_ORDER) {
      territories[n] = { ...territories[n]!, owner: '0', armies: 1 };
    }
    const players = base.players.map((p) => (p.id === '0' ? { ...p, reserves: 5 } : p));
    const s: GameState = { ...base, phase: 'reinforce', territories, players };
    const { next } = apply(s, { type: 'reinforce', territory: 'Alaska', count: 3 });
    expect(next.territories.Alaska!.armies).toBe(4);
    expect(next.players[0]!.reserves).toBe(2);
  });

  test('throws when placing on unowned territory', () => {
    const base = createInitialState({ seed: 'rein-err', players: PLAYERS });
    const territories = { ...base.territories };
    territories.Alaska = { ...territories.Alaska!, owner: '1', armies: 1 };
    const players = base.players.map((p) => (p.id === '0' ? { ...p, reserves: 5 } : p));
    const s: GameState = { ...base, phase: 'reinforce', territories, players };
    expect(() => apply(s, { type: 'reinforce', territory: 'Alaska', count: 1 })).toThrow(
      EngineError,
    );
  });
});

describe('trade-cards', () => {
  test('valid set grants armies', () => {
    const base = createInitialState({ seed: 'trade-test', players: PLAYERS });
    const cards = [
      { type: 'Infantry' as const, territory: 'Alaska' as const },
      { type: 'Cavalry' as const, territory: 'Brazil' as const },
      { type: 'Artillery' as const, territory: 'China' as const },
    ];
    const players: PlayerState[] = base.players.map((p) =>
      p.id === '0' ? { ...p, cards, reserves: 0 } : p,
    );
    const s: GameState = { ...base, phase: 'reinforce', players };
    const { next } = apply(s, { type: 'trade-cards', indices: [0, 1, 2] });
    expect(next.players[0]!.reserves).toBeGreaterThan(0);
    expect(next.players[0]!.cards).toHaveLength(0);
    expect(next.tradeCount).toBe(1);
  });

  test('throws on invalid set', () => {
    const base = createInitialState({ seed: 'trade-err', players: PLAYERS });
    const cards = [
      { type: 'Infantry' as const, territory: 'Alaska' as const },
      { type: 'Infantry' as const, territory: 'Brazil' as const },
      { type: 'Cavalry' as const, territory: 'China' as const },
    ];
    const players: PlayerState[] = base.players.map((p) => (p.id === '0' ? { ...p, cards } : p));
    const s: GameState = { ...base, phase: 'reinforce', players };
    expect(() => apply(s, { type: 'trade-cards', indices: [0, 1, 2] })).toThrow();
  });

  test('territory bonus is placed on the matched territory, not the reserves', () => {
    const base = createInitialState({ seed: 'trade-bonus', players: PLAYERS });
    const territories = { ...base.territories };
    territories.Alaska = { ...territories.Alaska!, owner: '0', armies: 1 };
    const cards = [
      { type: 'Infantry' as const, territory: 'Alaska' as const },
      { type: 'Cavalry' as const, territory: 'Brazil' as const },
      { type: 'Artillery' as const, territory: 'China' as const },
    ];
    const players: PlayerState[] = base.players.map((p) =>
      p.id === '0' ? { ...p, cards, reserves: 0 } : p,
    );
    const s: GameState = { ...base, phase: 'reinforce', territories, players };
    const { next } = apply(s, { type: 'trade-cards', indices: [0, 1, 2] });
    // First trade = 4 armies to reserves, +2 onto Alaska (owned, pictured in set).
    expect(next.players[0]!.reserves).toBe(4);
    expect(next.territories.Alaska!.armies).toBe(3);
  });

  test('no territory bonus if none of the cards match an owned territory', () => {
    const base = createInitialState({ seed: 'trade-no-bonus', players: PLAYERS });
    const cards = [
      { type: 'Infantry' as const, territory: 'Alaska' as const },
      { type: 'Cavalry' as const, territory: 'Brazil' as const },
      { type: 'Artillery' as const, territory: 'China' as const },
    ];
    const players: PlayerState[] = base.players.map((p) =>
      p.id === '0' ? { ...p, cards, reserves: 0 } : p,
    );
    const s: GameState = { ...base, phase: 'reinforce', players };
    const { next } = apply(s, { type: 'trade-cards', indices: [0, 1, 2] });
    expect(next.players[0]!.reserves).toBe(4);
    // Alaska armies unchanged (player doesn't own it)
    expect(next.territories.Alaska!.armies).toBe(0);
  });
});

describe('forced card trade (five-card limit)', () => {
  test('incoming turn with 5+ cards blocks non-trade actions', () => {
    const base = createInitialState({ seed: 'forced-5', players: PLAYERS });
    const territories = { ...base.territories };
    // give player 1 one territory so reinforcement math is non-degenerate
    territories.Brazil = { ...territories.Brazil!, owner: '1', armies: 1 };
    const fiveCards = [
      { type: 'Infantry' as const, territory: 'Alaska' as const },
      { type: 'Cavalry' as const, territory: 'Brazil' as const },
      { type: 'Artillery' as const, territory: 'China' as const },
      { type: 'Infantry' as const, territory: 'Ural' as const },
      { type: 'Infantry' as const, territory: 'India' as const },
    ];
    const players: PlayerState[] = base.players.map((p, i) => ({
      ...p,
      cards: i === 1 ? fiveCards : [],
    }));
    // Current player 0 is in fortify; end-turn will advance to player 1.
    const s: GameState = { ...base, phase: 'fortify', territories, players };
    const { next } = apply(s, { type: 'end-turn' });
    expect(next.currentPlayerIdx).toBe(1);
    expect(next.pendingForcedTrade).toBeDefined();
    expect(next.pendingForcedTrade!.reason).toBe('five-card-limit');
    // Non-trade action should throw
    expect(() => apply(next, { type: 'reinforce', territory: 'Brazil', count: 1 })).toThrow(
      EngineError,
    );
    // After a valid trade, the flag clears.
    const { next: afterTrade } = apply(next, { type: 'trade-cards', indices: [0, 1, 2] });
    expect(afterTrade.pendingForcedTrade).toBeUndefined();
  });
});

describe('end-attack-phase', () => {
  test('transitions to fortify phase', () => {
    const base = createInitialState({ seed: 'end-atk', players: PLAYERS });
    const s: GameState = { ...base, phase: 'attack' };
    const { next } = apply(s, { type: 'end-attack-phase' });
    expect(next.phase).toBe('fortify');
  });

  test('draws card if player conquered territory', () => {
    const base = createInitialState({ seed: 'draw-card', players: PLAYERS });
    const s: GameState = { ...base, phase: 'attack', conqueredThisTurn: true };
    const { next } = apply(s, { type: 'end-attack-phase' });
    expect(next.players[0]!.cards).toHaveLength(1);
    expect(next.conqueredThisTurn).toBe(false);
  });
});

describe('fortify', () => {
  test('valid fortify moves armies', () => {
    const base = createInitialState({ seed: 'fortify-r', players: PLAYERS });
    const territories = { ...base.territories };
    territories.Alaska = { ...territories.Alaska!, owner: '0', armies: 5 };
    territories['Northwest Territory'] = {
      ...territories['Northwest Territory']!,
      owner: '0',
      armies: 1,
    };
    const s: GameState = { ...base, phase: 'fortify', territories };
    const { next } = apply(s, {
      type: 'fortify',
      from: 'Alaska',
      to: 'Northwest Territory',
      count: 2,
    });
    expect(next.territories.Alaska!.armies).toBe(3);
    expect(next.territories['Northwest Territory']!.armies).toBe(3);
    expect(next.phase).toBe('reinforce'); // end turn after fortify
  });
});

describe('end-turn', () => {
  test('advances to next non-eliminated player', () => {
    const base = createInitialState({ seed: 'end-turn', players: PLAYERS });
    const s: GameState = { ...base, phase: 'fortify' };
    const { next } = apply(s, { type: 'end-turn' });
    expect(next.currentPlayerIdx).toBe(1);
    expect(next.phase).toBe('reinforce');
  });

  test('two-player variant: end-turn skips Neutral seat', () => {
    const base = createInitialState({
      seed: '2p-end-turn',
      players: [
        { id: '0', name: 'Alice', color: '#dc2626', isAI: false },
        { id: '1', name: 'Bob', color: '#2563eb', isAI: true },
      ],
    });
    // Player 0 ends turn — should go to player 1 (Bob), not index 2 (Neutral).
    const { next: afterAlice } = apply({ ...base, phase: 'fortify' }, { type: 'end-turn' });
    expect(afterAlice.currentPlayerIdx).toBe(1);
    expect(afterAlice.players[1]?.id).toBe('1');

    // Player 1 ends turn — should wrap to player 0 (Alice), skipping Neutral.
    const { next: afterBob } = apply({ ...afterAlice, phase: 'fortify' }, { type: 'end-turn' });
    expect(afterBob.currentPlayerIdx).toBe(0);
    expect(afterBob.players[afterBob.currentPlayerIdx]?.isNeutral).toBeUndefined();
  });
});

describe('concede', () => {
  test('marks current player as eliminated', () => {
    const base = createInitialState({ seed: 'concede', players: PLAYERS });
    const s: GameState = { ...base, phase: 'reinforce' };
    const { next } = apply(s, { type: 'concede' });
    expect(next.players[0]!.eliminated).toBe(true);
  });
});

describe('move-after-capture', () => {
  test('moves armies from pending source to target', () => {
    const base = createInitialState({ seed: 'mac', players: PLAYERS });
    const territories = { ...base.territories };
    territories.Alaska = { ...territories.Alaska!, owner: '0', armies: 4 };
    territories.Kamchatka = { ...territories.Kamchatka!, owner: '0', armies: 0 };
    const s: GameState = {
      ...base,
      phase: 'attack',
      territories,
      pendingMove: {
        source: 'Alaska',
        target: 'Kamchatka',
        min: 1,
        max: 3,
        atkDiceRolled: 3,
      },
    };
    const { next } = apply(s, { type: 'move-after-capture', count: 2 });
    expect(next.territories.Alaska!.armies).toBe(2);
    expect(next.territories.Kamchatka!.armies).toBe(2);
    expect(next.pendingMove).toBeUndefined();
  });
});
