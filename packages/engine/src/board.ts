import type { TerritoryName } from './types';

// ---------------------------------------------------------------------------
// Continents
// ---------------------------------------------------------------------------

export interface ContinentDef {
  readonly name: string;
  readonly bonus: number;
  readonly color: string;
  readonly labelX: number;
  readonly labelY: number;
  readonly members: readonly TerritoryName[];
}

export const CONTINENTS: Readonly<Record<string, ContinentDef>> = Object.freeze({
  NA: {
    name: 'North America',
    bonus: 5,
    color: 'rgba(220, 38, 38, 0.08)',
    labelX: 175,
    labelY: 40,
    members: [
      'Alaska',
      'Northwest Territory',
      'Greenland',
      'Alberta',
      'Ontario',
      'Quebec',
      'Western US',
      'Eastern US',
      'Central America',
    ],
  },
  SA: {
    name: 'South America',
    bonus: 2,
    color: 'rgba(5, 150, 105, 0.08)',
    labelX: 225,
    labelY: 448,
    members: ['Venezuela', 'Brazil', 'Peru', 'Argentina'],
  },
  EU: {
    name: 'Europe',
    bonus: 5,
    color: 'rgba(37, 99, 235, 0.08)',
    labelX: 495,
    labelY: 95,
    members: [
      'Iceland',
      'Scandinavia',
      'Great Britain',
      'Northern Europe',
      'Ukraine',
      'Southern Europe',
      'Western Europe',
    ],
  },
  AF: {
    name: 'Africa',
    bonus: 3,
    color: 'rgba(217, 119, 6, 0.08)',
    labelX: 430,
    labelY: 440,
    members: ['North Africa', 'Egypt', 'East Africa', 'Congo', 'South Africa', 'Madagascar'],
  },
  AS: {
    name: 'Asia',
    bonus: 7,
    color: 'rgba(124, 58, 237, 0.08)',
    labelX: 775,
    labelY: 90,
    members: [
      'Ural',
      'Siberia',
      'Yakutsk',
      'Kamchatka',
      'Irkutsk',
      'Mongolia',
      'Japan',
      'Afghanistan',
      'China',
      'Middle East',
      'India',
      'Siam',
    ],
  },
  AU: {
    name: 'Australia',
    bonus: 2,
    color: 'rgba(236, 72, 153, 0.08)',
    labelX: 865,
    labelY: 410,
    members: ['Indonesia', 'New Guinea', 'Western Australia', 'Eastern Australia'],
  },
});

// ---------------------------------------------------------------------------
// Territory definitions: [continent, x, y, adjacencies[]]
// ---------------------------------------------------------------------------

export interface TerritoryDef {
  readonly continent: string;
  readonly x: number;
  readonly y: number;
  readonly adj: readonly TerritoryName[];
}

export const TERRITORIES: Readonly<Record<TerritoryName, TerritoryDef>> = Object.freeze({
  // North America
  Alaska: {
    continent: 'NA',
    x: 60,
    y: 120,
    adj: ['Northwest Territory', 'Alberta', 'Kamchatka'],
  },
  'Northwest Territory': {
    continent: 'NA',
    x: 150,
    y: 130,
    adj: ['Alaska', 'Alberta', 'Ontario', 'Greenland'],
  },
  Greenland: {
    continent: 'NA',
    x: 295,
    y: 70,
    adj: ['Northwest Territory', 'Ontario', 'Quebec', 'Iceland'],
  },
  Alberta: {
    continent: 'NA',
    x: 150,
    y: 205,
    adj: ['Alaska', 'Northwest Territory', 'Ontario', 'Western US'],
  },
  Ontario: {
    continent: 'NA',
    x: 230,
    y: 215,
    adj: ['Northwest Territory', 'Greenland', 'Quebec', 'Alberta', 'Western US', 'Eastern US'],
  },
  Quebec: {
    continent: 'NA',
    x: 305,
    y: 215,
    adj: ['Greenland', 'Ontario', 'Eastern US'],
  },
  'Western US': {
    continent: 'NA',
    x: 160,
    y: 290,
    adj: ['Alberta', 'Ontario', 'Eastern US', 'Central America'],
  },
  'Eastern US': {
    continent: 'NA',
    x: 245,
    y: 300,
    adj: ['Ontario', 'Quebec', 'Western US', 'Central America'],
  },
  'Central America': {
    continent: 'NA',
    x: 180,
    y: 370,
    adj: ['Western US', 'Eastern US', 'Venezuela'],
  },

  // South America
  Venezuela: {
    continent: 'SA',
    x: 260,
    y: 410,
    adj: ['Central America', 'Brazil', 'Peru'],
  },
  Brazil: {
    continent: 'SA',
    x: 315,
    y: 470,
    adj: ['Venezuela', 'Peru', 'Argentina', 'North Africa'],
  },
  Peru: {
    continent: 'SA',
    x: 270,
    y: 510,
    adj: ['Venezuela', 'Brazil', 'Argentina'],
  },
  Argentina: {
    continent: 'SA',
    x: 290,
    y: 570,
    adj: ['Peru', 'Brazil'],
  },

  // Europe
  Iceland: {
    continent: 'EU',
    x: 405,
    y: 145,
    adj: ['Greenland', 'Scandinavia', 'Great Britain'],
  },
  Scandinavia: {
    continent: 'EU',
    x: 475,
    y: 135,
    adj: ['Iceland', 'Great Britain', 'Northern Europe', 'Ukraine'],
  },
  'Great Britain': {
    continent: 'EU',
    x: 425,
    y: 205,
    adj: ['Iceland', 'Scandinavia', 'Northern Europe', 'Western Europe'],
  },
  'Northern Europe': {
    continent: 'EU',
    x: 490,
    y: 225,
    adj: ['Scandinavia', 'Great Britain', 'Ukraine', 'Southern Europe', 'Western Europe'],
  },
  Ukraine: {
    continent: 'EU',
    x: 560,
    y: 205,
    adj: [
      'Scandinavia',
      'Northern Europe',
      'Southern Europe',
      'Ural',
      'Afghanistan',
      'Middle East',
    ],
  },
  'Southern Europe': {
    continent: 'EU',
    x: 490,
    y: 285,
    adj: ['Northern Europe', 'Ukraine', 'Western Europe', 'North Africa', 'Egypt', 'Middle East'],
  },
  'Western Europe': {
    continent: 'EU',
    x: 425,
    y: 295,
    adj: ['Great Britain', 'Northern Europe', 'Southern Europe', 'North Africa'],
  },

  // Africa
  'North Africa': {
    continent: 'AF',
    x: 465,
    y: 380,
    adj: ['Brazil', 'Western Europe', 'Southern Europe', 'Egypt', 'East Africa', 'Congo'],
  },
  Egypt: {
    continent: 'AF',
    x: 525,
    y: 365,
    adj: ['Southern Europe', 'North Africa', 'East Africa', 'Middle East'],
  },
  'East Africa': {
    continent: 'AF',
    x: 565,
    y: 430,
    adj: ['Egypt', 'North Africa', 'Congo', 'South Africa', 'Madagascar', 'Middle East'],
  },
  Congo: {
    continent: 'AF',
    x: 515,
    y: 470,
    adj: ['North Africa', 'East Africa', 'South Africa'],
  },
  'South Africa': {
    continent: 'AF',
    x: 515,
    y: 550,
    adj: ['Congo', 'East Africa', 'Madagascar'],
  },
  Madagascar: {
    continent: 'AF',
    x: 585,
    y: 540,
    adj: ['East Africa', 'South Africa'],
  },

  // Asia
  Ural: {
    continent: 'AS',
    x: 640,
    y: 185,
    adj: ['Ukraine', 'Siberia', 'China', 'Afghanistan'],
  },
  Siberia: {
    continent: 'AS',
    x: 710,
    y: 155,
    adj: ['Ural', 'Yakutsk', 'Irkutsk', 'Mongolia', 'China'],
  },
  Yakutsk: {
    continent: 'AS',
    x: 795,
    y: 125,
    adj: ['Siberia', 'Kamchatka', 'Irkutsk'],
  },
  Kamchatka: {
    continent: 'AS',
    x: 890,
    y: 135,
    adj: ['Alaska', 'Yakutsk', 'Irkutsk', 'Mongolia', 'Japan'],
  },
  Irkutsk: {
    continent: 'AS',
    x: 775,
    y: 200,
    adj: ['Siberia', 'Yakutsk', 'Kamchatka', 'Mongolia'],
  },
  Mongolia: {
    continent: 'AS',
    x: 795,
    y: 255,
    adj: ['Siberia', 'Irkutsk', 'Kamchatka', 'Japan', 'China'],
  },
  Japan: {
    continent: 'AS',
    x: 910,
    y: 245,
    adj: ['Kamchatka', 'Mongolia'],
  },
  Afghanistan: {
    continent: 'AS',
    x: 650,
    y: 265,
    adj: ['Ukraine', 'Ural', 'China', 'India', 'Middle East'],
  },
  China: {
    continent: 'AS',
    x: 755,
    y: 305,
    adj: ['Ural', 'Siberia', 'Mongolia', 'Afghanistan', 'India', 'Siam'],
  },
  'Middle East': {
    continent: 'AS',
    x: 605,
    y: 325,
    adj: ['Ukraine', 'Southern Europe', 'Egypt', 'East Africa', 'Afghanistan', 'India'],
  },
  India: {
    continent: 'AS',
    x: 700,
    y: 355,
    adj: ['Afghanistan', 'China', 'Middle East', 'Siam'],
  },
  Siam: {
    continent: 'AS',
    x: 775,
    y: 385,
    adj: ['China', 'India', 'Indonesia'],
  },

  // Australia
  Indonesia: {
    continent: 'AU',
    x: 825,
    y: 455,
    adj: ['Siam', 'New Guinea', 'Western Australia'],
  },
  'New Guinea': {
    continent: 'AU',
    x: 915,
    y: 435,
    adj: ['Indonesia', 'Western Australia', 'Eastern Australia'],
  },
  'Western Australia': {
    continent: 'AU',
    x: 865,
    y: 540,
    adj: ['Indonesia', 'New Guinea', 'Eastern Australia'],
  },
  'Eastern Australia': {
    continent: 'AU',
    x: 930,
    y: 540,
    adj: ['New Guinea', 'Western Australia'],
  },
});

export const BOARD_TERRITORY_COUNT = 42;

// ---------------------------------------------------------------------------
// Adjacency structures
// ---------------------------------------------------------------------------

/** Canonical order used to build the deck and adjacency pairs */
export const TERR_ORDER: readonly TerritoryName[] = Object.freeze(
  Object.keys(TERRITORIES) as TerritoryName[],
);

/** Trans-pacific edge (rendered as dashed edge-exit line in UI) */
export const EDGE_EXIT_PAIRS: readonly (readonly [TerritoryName, TerritoryName])[] = Object.freeze([
  ['Alaska', 'Kamchatka'] as const,
]);

function buildAdjPairs(): readonly (readonly [TerritoryName, TerritoryName])[] {
  const edgeKey = new Set(EDGE_EXIT_PAIRS.map(([a, b]) => [a, b].sort().join('|')));
  const pairs: [TerritoryName, TerritoryName][] = [];
  const seen = new Set<string>();
  for (const name of TERR_ORDER) {
    const terrDef = TERRITORIES[name];
    if (!terrDef) continue;
    for (const other of terrDef.adj) {
      const key = [name, other].sort().join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push([name, other]);
      void edgeKey; // edgeKey used for UI; included in export for UI consumers
    }
  }
  return Object.freeze(pairs);
}

export const ADJ_PAIRS: readonly (readonly [TerritoryName, TerritoryName])[] = buildAdjPairs();

/** O(1) adjacency lookup */
export const ADJACENCY: Readonly<Record<TerritoryName, readonly TerritoryName[]>> = Object.freeze(
  Object.fromEntries(TERR_ORDER.map((name) => [name, TERRITORIES[name]?.adj ?? []])) as Record<
    TerritoryName,
    readonly TerritoryName[]
  >,
);

// ---------------------------------------------------------------------------
// Card deck
// ---------------------------------------------------------------------------

export const CARD_TYPES = ['Infantry', 'Cavalry', 'Artillery'] as const;
export type BaseCardType = (typeof CARD_TYPES)[number];

export interface CardTemplate {
  readonly territory: TerritoryName | null;
  readonly type: string;
}

export function buildDeck(): CardTemplate[] {
  const deck: CardTemplate[] = TERR_ORDER.map((name, i) => ({
    territory: name,
    type: CARD_TYPES[i % 3] as string,
  }));
  deck.push({ territory: null, type: 'Wild' });
  deck.push({ territory: null, type: 'Wild' });
  return deck;
}

// ---------------------------------------------------------------------------
// Palette & other constants
// ---------------------------------------------------------------------------

export const PALETTE = Object.freeze([
  { color: '#dc2626', name: 'Crimson' },
  { color: '#2563eb', name: 'Sapphire' },
  { color: '#059669', name: 'Emerald' },
  { color: '#d97706', name: 'Amber' },
  { color: '#7c3aed', name: 'Violet' },
  { color: '#ec4899', name: 'Rose' },
]);

export const STARTING_ARMIES: Readonly<Record<number, number>> = Object.freeze({
  3: 35,
  4: 30,
  5: 25,
  6: 20,
});
