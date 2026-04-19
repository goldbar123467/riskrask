import { describe, expect, test } from 'bun:test';
import { Arch } from '../src/arch.js';
import { Book } from '../src/book.js';

describe('Book', () => {
  test('getBook returns null for null id', () => {
    expect(Book.get(null)).toBeNull();
  });

  test('getBook returns null for unknown id', () => {
    expect(Book.get('nonexistent-book')).toBeNull();
  });

  test('getBook returns correct book for europe-blitz', () => {
    const b = Book.get('europe-blitz');
    expect(b).not.toBeNull();
    expect(b?.booksExpireAfterTurn).toBe(3);
  });

  test('claimScore for europe-blitz prefers EU territories', () => {
    const euScore = Book.claimScore('europe-blitz', 'France');
    const asScore = Book.claimScore('europe-blitz', 'China');
    // EU territories score 100 (capped at 50), non-EU territories score lower
    expect(Book.claimScore('europe-blitz', 'Southern Europe')).toBeGreaterThan(
      Book.claimScore('europe-blitz', 'China')
    );
  });

  test('reinforceBonus returns 0 after book expires', () => {
    const bonus = Book.reinforceBonus('europe-blitz', 'Southern Europe', 10);
    expect(bonus).toBe(0); // expires after turn 3
  });

  test('reinforceBonus returns positive within book expiry', () => {
    const bonus = Book.reinforceBonus('europe-blitz', 'Southern Europe', 1);
    expect(bonus).toBeGreaterThan(0);
  });

  test('attackBonus returns 15 for priority territory within expiry', () => {
    // 'Ukraine' is earlyAttackPriority for europe-blitz
    const bonus = Book.attackBonus('europe-blitz', 'Ukraine', 2);
    expect(bonus).toBe(15);
  });

  test('attackBonus returns 0 for non-priority territory', () => {
    expect(Book.attackBonus('europe-blitz', 'Alaska', 1)).toBe(0);
  });

  test('all archetype openingBooks resolve', () => {
    for (const arch of Arch.list()) {
      if (arch.openingBook) {
        const b = Book.get(arch.openingBook);
        expect(b).not.toBeNull();
      }
    }
  });

  test('claimScore is capped at 50', () => {
    for (const id of ['europe-blitz', 'continent-fortress', 'asian-pivot', 'isolation', 'patient-build']) {
      for (const terr of ['Ukraine', 'Indonesia', 'China', 'Alaska']) {
        const s = Book.claimScore(id, terr);
        expect(s).toBeLessThanOrEqual(50);
      }
    }
  });
});
