/**
 * Opening books — ported from v2 `const Book`.
 * Each book has claim preferences, reinforce focus, early attack priority.
 */

import type { TerritoryName } from '@riskrask/engine';

export interface BookDef {
  readonly claimPreference: (name: string) => number;
  readonly reinforceFocus: readonly string[];
  readonly earlyAttackPriority: readonly string[];
  readonly booksExpireAfterTurn: number;
}

// Ported verbatim from v2 Book.books
// TERR_DATA[name][0] === continent id in v2; here we map territory names to continents inline.
const TERR_CONTINENT: Readonly<Record<string, string>> = {
  // North America
  Alaska: 'NA',
  'Northwest Territory': 'NA',
  Greenland: 'NA',
  Alberta: 'NA',
  Ontario: 'NA',
  Quebec: 'NA',
  'Western US': 'NA',
  'Eastern US': 'NA',
  'Central America': 'NA',
  // South America
  Venezuela: 'SA',
  Brazil: 'SA',
  Peru: 'SA',
  Argentina: 'SA',
  // Europe
  Iceland: 'EU',
  'Great Britain': 'EU',
  'Northern Europe': 'EU',
  Scandinavia: 'EU',
  Ukraine: 'EU',
  'Western Europe': 'EU',
  'Southern Europe': 'EU',
  // Africa
  'North Africa': 'AF',
  Egypt: 'AF',
  'East Africa': 'AF',
  Congo: 'AF',
  'South Africa': 'AF',
  Madagascar: 'AF',
  // Asia
  Ural: 'AS',
  Siberia: 'AS',
  Yakutsk: 'AS',
  Kamchatka: 'AS',
  Irkutsk: 'AS',
  Mongolia: 'AS',
  Japan: 'AS',
  China: 'AS',
  'Middle East': 'AS',
  India: 'AS',
  Siam: 'AS',
  Afghanistan: 'AS',
  // Australia
  Indonesia: 'AU',
  'New Guinea': 'AU',
  'Western Australia': 'AU',
  'Eastern Australia': 'AU',
};

function contOf(name: string): string {
  return TERR_CONTINENT[name] ?? '';
}

const BOOKS: Readonly<Record<string, BookDef>> = Object.freeze({
  'europe-blitz': {
    claimPreference: (name) => {
      const c = contOf(name);
      if (c === 'EU') return 100;
      if (c === 'AF' && name !== 'Madagascar' && name !== 'South Africa') return 40;
      if (c === 'AS' && (name === 'Ural' || name === 'Middle East')) return 30;
      return 10;
    },
    reinforceFocus: [
      'Southern Europe',
      'Ukraine',
      'Northern Europe',
      'Western Europe',
      'North Africa',
    ],
    earlyAttackPriority: ['Ukraine', 'Scandinavia', 'Middle East'],
    booksExpireAfterTurn: 3,
  },
  'continent-fortress': {
    claimPreference: (name) => {
      const c = contOf(name);
      if (c === 'AU') return 100;
      if (c === 'SA') return 80;
      if (c === 'AF') return 50;
      return 20;
    },
    reinforceFocus: ['Indonesia', 'Siam', 'Central America', 'Venezuela', 'North Africa'],
    earlyAttackPriority: [],
    booksExpireAfterTurn: 4,
  },
  'asian-pivot': {
    claimPreference: (name) => {
      const c = contOf(name);
      if (c === 'AS') return 100;
      if (c === 'AU') return 50;
      if (name === 'Middle East' || name === 'Ural') return 90;
      return 15;
    },
    reinforceFocus: ['China', 'India', 'Mongolia', 'Middle East', 'Ural'],
    earlyAttackPriority: ['Siam', 'Indonesia'],
    booksExpireAfterTurn: 3,
  },
  isolation: {
    claimPreference: (name) => {
      const c = contOf(name);
      if (c === 'AU') return 100;
      if (name === 'Madagascar' || name === 'South Africa') return 70;
      if (c === 'SA') return 60;
      return 10;
    },
    reinforceFocus: ['Indonesia', 'Eastern Australia', 'Western Australia', 'New Guinea'],
    earlyAttackPriority: [],
    booksExpireAfterTurn: 5,
  },
  'patient-build': {
    claimPreference: (name) => {
      const c = contOf(name);
      if (c === 'AF') return 70;
      if (c === 'SA') return 70;
      if (c === 'AU') return 60;
      return 30;
    },
    reinforceFocus: ['Brazil', 'North Africa', 'East Africa', 'Egypt'],
    earlyAttackPriority: [],
    booksExpireAfterTurn: 4,
  },
});

export function getBook(id: string | null | undefined): BookDef | null {
  if (!id) return null;
  return BOOKS[id] ?? null;
}

export function isBookActive(bookId: string | null | undefined, currentTurn: number): boolean {
  const b = getBook(bookId);
  if (!b) return false;
  return currentTurn <= b.booksExpireAfterTurn;
}

export function bookClaimScore(bookId: string | null | undefined, name: string): number {
  const b = getBook(bookId);
  return b ? Math.min(50, b.claimPreference(name)) : 0;
}

export function bookReinforceBonus(
  bookId: string | null | undefined,
  name: TerritoryName,
  currentTurn: number,
): number {
  const b = getBook(bookId);
  if (!b || !isBookActive(bookId, currentTurn)) return 0;
  const idx = b.reinforceFocus.indexOf(name);
  if (idx < 0) return 0;
  return 30 - idx * 5;
}

export function bookAttackBonus(
  bookId: string | null | undefined,
  target: TerritoryName,
  currentTurn: number,
): number {
  const b = getBook(bookId);
  if (!b || !isBookActive(bookId, currentTurn)) return 0;
  return b.earlyAttackPriority.includes(target) ? 15 : 0;
}

export const Book = {
  get: getBook,
  active: isBookActive,
  claimScore: bookClaimScore,
  reinforceBonus: bookReinforceBonus,
  attackBonus: bookAttackBonus,
  BOOKS,
};
