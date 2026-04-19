/**
 * Archetype catalog — ported verbatim from v2 `const Arch`.
 * Pure data; no I/O, no globals.
 */

export interface ReinforceWeights {
  readonly adjEnemies: number;
  readonly maxEnemyArmies: number;
  readonly continentBorder: number;
  readonly nearContinent: number;
  readonly adjFriendly: number;
}

export interface AttackWeights {
  readonly completeContinent: number;
  readonly breakContinent: number;
  readonly eliminate: number;
  readonly armyAdvantage: number;
  readonly hopelessPenalty: number;
}

export interface ArchWeights {
  readonly reinforce: ReinforceWeights;
  readonly attack: AttackWeights;
  readonly grudge: number;
  readonly reputation: number;
  readonly goalWeight: number;
}

export interface RubberBandConfig {
  readonly leaderBonus: number;
  readonly trailerBonus: number;
}

export interface VoiceConfig {
  readonly prefix: string;
  readonly speechLevel: string;
}

export interface MoodConfig {
  readonly onWin: string;
  readonly onLoss: string;
  readonly onCapture: string;
  readonly onAttacked: string;
  readonly default: string;
}

export interface RuleMods {
  readonly reinforceBonus?: number | undefined;
  readonly reinforceLossPerAttack?: number | undefined;
  readonly minAttackStack?: number | undefined;
  readonly noAttackBeforeTurn?: number | undefined;
  readonly rerollOneLoss?: boolean | undefined;
}

export interface ArchDef {
  readonly id: string;
  readonly name: string;
  readonly era: string;
  readonly color: string;
  readonly description: string;
  readonly weights: ArchWeights;
  readonly temperature: number;
  readonly mistakeRate: number;
  readonly fatigueRate: number;
  readonly lossAversion: number;
  readonly rubberBand: RubberBandConfig;
  readonly voice: VoiceConfig;
  readonly mood: MoodConfig;
  readonly openingBook: string | null;
  readonly ruleMods: RuleMods | null;
  readonly preferredContinent: string | null;
  readonly goalBias: string | null;
}

const CATALOG: Record<string, ArchDef> = {
  dilettante: {
    id: 'dilettante',
    name: 'The Dilettante',
    era: 'Average Player',
    color: '#94a3b8',
    description: 'Competent, unremarkable. The baseline.',
    weights: {
      reinforce: {
        adjEnemies: 1,
        maxEnemyArmies: 1,
        continentBorder: 1,
        nearContinent: 1,
        adjFriendly: 1,
      },
      attack: {
        completeContinent: 1,
        breakContinent: 1,
        eliminate: 1,
        armyAdvantage: 1,
        hopelessPenalty: 1,
      },
      grudge: 0.2,
      reputation: 0.3,
      goalWeight: 0.3,
    },
    temperature: 1.2,
    mistakeRate: 0.08,
    fatigueRate: 0.003,
    lossAversion: 1.1,
    rubberBand: { leaderBonus: 0.2, trailerBonus: -0.1 },
    voice: { prefix: '', speechLevel: 'neutral' },
    mood: {
      onWin: 'neutral',
      onLoss: 'neutral',
      onCapture: 'content',
      onAttacked: 'annoyed',
      default: 'neutral',
    },
    openingBook: null,
    ruleMods: null,
    preferredContinent: null,
    goalBias: null,
  },
  napoleon: {
    id: 'napoleon',
    name: 'Bonaparte',
    era: 'French Empire, 1809',
    color: '#c0392b',
    description: 'Demands decisive engagements. Despises timid defense.',
    weights: {
      reinforce: {
        adjEnemies: 1.4,
        maxEnemyArmies: 0.7,
        continentBorder: 1.5,
        nearContinent: 1.8,
        adjFriendly: 0.5,
      },
      attack: {
        completeContinent: 1.5,
        breakContinent: 1.3,
        eliminate: 1.2,
        armyAdvantage: 0.8,
        hopelessPenalty: 0.7,
      },
      grudge: 0.5,
      reputation: 0.1,
      goalWeight: 1.0,
    },
    temperature: 0.8,
    mistakeRate: 0.04,
    fatigueRate: 0.001,
    lossAversion: 0.8,
    rubberBand: { leaderBonus: 0.1, trailerBonus: -0.3 },
    voice: { prefix: 'The Emperor', speechLevel: 'regal' },
    mood: {
      onWin: 'triumphant',
      onLoss: 'furious',
      onCapture: 'victorious',
      onAttacked: 'insulted',
      default: 'confident',
    },
    openingBook: 'europe-blitz',
    ruleMods: null,
    preferredContinent: 'EU',
    goalBias: 'holdContinent',
  },
  fortress: {
    id: 'fortress',
    name: 'The Fortress',
    era: 'Maginot Doctrine',
    color: '#475569',
    description: 'Walls high, patience eternal. Strikes only with overwhelming force.',
    weights: {
      reinforce: {
        adjEnemies: 1.8,
        maxEnemyArmies: 2.0,
        continentBorder: 2.0,
        nearContinent: 0.6,
        adjFriendly: 0.3,
      },
      attack: {
        completeContinent: 1.0,
        breakContinent: 0.5,
        eliminate: 0.6,
        armyAdvantage: 1.8,
        hopelessPenalty: 2.0,
      },
      grudge: 0.1,
      reputation: 0.6,
      goalWeight: 0.8,
    },
    temperature: 0.5,
    mistakeRate: 0.02,
    fatigueRate: 0.0005,
    lossAversion: 1.6,
    rubberBand: { leaderBonus: 0.0, trailerBonus: 0.0 },
    voice: { prefix: 'The garrison', speechLevel: 'terse' },
    mood: {
      onWin: 'stoic',
      onLoss: 'stoic',
      onCapture: 'satisfied',
      onAttacked: 'alert',
      default: 'watchful',
    },
    openingBook: 'continent-fortress',
    ruleMods: null,
    preferredContinent: null,
    goalBias: 'survive',
  },
  jackal: {
    id: 'jackal',
    name: 'The Jackal',
    era: 'Scavenger Doctrine',
    color: '#d97706',
    description: 'Farms the wounded. Never picks a fair fight.',
    weights: {
      reinforce: {
        adjEnemies: 0.8,
        maxEnemyArmies: 0.4,
        continentBorder: 0.3,
        nearContinent: 0.6,
        adjFriendly: 1.2,
      },
      attack: {
        completeContinent: 0.5,
        breakContinent: 0.8,
        eliminate: 2.2,
        armyAdvantage: 1.8,
        hopelessPenalty: 1.5,
      },
      grudge: 0.1,
      reputation: 0.2,
      goalWeight: 1.2,
    },
    temperature: 1.0,
    mistakeRate: 0.05,
    fatigueRate: 0.001,
    lossAversion: 1.3,
    rubberBand: { leaderBonus: 0.3, trailerBonus: -0.2 },
    voice: { prefix: '', speechLevel: 'mocking' },
    mood: {
      onWin: 'hungry',
      onLoss: 'slinking',
      onCapture: 'gorged',
      onAttacked: 'baring-teeth',
      default: 'stalking',
    },
    openingBook: null,
    ruleMods: null,
    preferredContinent: null,
    goalBias: 'eliminateFirst',
  },
  vengeful: {
    id: 'vengeful',
    name: 'The Tsar',
    era: 'Romanov Era',
    color: '#7c3aed',
    description: 'Forgets nothing. Reciprocates with interest.',
    weights: {
      reinforce: {
        adjEnemies: 1.2,
        maxEnemyArmies: 1.3,
        continentBorder: 1.0,
        nearContinent: 1.0,
        adjFriendly: 0.8,
      },
      attack: {
        completeContinent: 0.9,
        breakContinent: 1.4,
        eliminate: 1.0,
        armyAdvantage: 1.0,
        hopelessPenalty: 0.9,
      },
      grudge: 2.5,
      reputation: 0.8,
      goalWeight: 0.7,
    },
    temperature: 0.9,
    mistakeRate: 0.04,
    fatigueRate: 0.002,
    lossAversion: 1.2,
    rubberBand: { leaderBonus: 0.0, trailerBonus: -0.4 },
    voice: { prefix: 'The Tsar', speechLevel: 'regal' },
    mood: {
      onWin: 'vindicated',
      onLoss: 'seething',
      onCapture: 'cold-smile',
      onAttacked: 'incensed',
      default: 'brooding',
    },
    openingBook: null,
    ruleMods: { reinforceBonus: 1, reinforceLossPerAttack: 1 },
    preferredContinent: null,
    goalBias: 'breakBonuses',
  },
  patient: {
    id: 'patient',
    name: 'The Patriarch',
    era: 'Long Game',
    color: '#059669',
    description: 'The early game is theater. The late game is theirs.',
    weights: {
      reinforce: {
        adjEnemies: 1.1,
        maxEnemyArmies: 1.1,
        continentBorder: 1.3,
        nearContinent: 1.0,
        adjFriendly: 0.7,
      },
      attack: {
        completeContinent: 1.2,
        breakContinent: 1.1,
        eliminate: 1.0,
        armyAdvantage: 1.3,
        hopelessPenalty: 1.4,
      },
      grudge: 0.3,
      reputation: 0.5,
      goalWeight: 0.9,
    },
    temperature: 0.7,
    mistakeRate: 0.03,
    fatigueRate: -0.001,
    lossAversion: 1.3,
    rubberBand: { leaderBonus: 0.0, trailerBonus: -0.1 },
    voice: { prefix: '', speechLevel: 'sage' },
    mood: {
      onWin: 'serene',
      onLoss: 'patient',
      onCapture: 'nodding',
      onAttacked: 'unmoved',
      default: 'meditative',
    },
    openingBook: 'patient-build',
    ruleMods: null,
    preferredContinent: null,
    goalBias: 'survive',
  },
  shogun: {
    id: 'shogun',
    name: 'The Shogun',
    era: 'Sengoku Period',
    color: '#0ea5e9',
    description: 'Strikes only when armies are ready. Honor in restraint.',
    weights: {
      reinforce: {
        adjEnemies: 1.3,
        maxEnemyArmies: 1.2,
        continentBorder: 1.2,
        nearContinent: 1.1,
        adjFriendly: 0.6,
      },
      attack: {
        completeContinent: 1.1,
        breakContinent: 1.0,
        eliminate: 0.8,
        armyAdvantage: 1.6,
        hopelessPenalty: 1.3,
      },
      grudge: 0.4,
      reputation: 0.7,
      goalWeight: 0.8,
    },
    temperature: 0.6,
    mistakeRate: 0.02,
    fatigueRate: 0.001,
    lossAversion: 1.4,
    rubberBand: { leaderBonus: 0.0, trailerBonus: 0.0 },
    voice: { prefix: '', speechLevel: 'formal' },
    mood: {
      onWin: 'composed',
      onLoss: 'dishonored',
      onCapture: 'bowed',
      onAttacked: 'drawn-blade',
      default: 'still',
    },
    openingBook: 'asian-pivot',
    ruleMods: { minAttackStack: 4 },
    preferredContinent: 'AS',
    goalBias: 'holdContinent',
  },
  hermit: {
    id: 'hermit',
    name: 'The Hermit',
    era: 'Isolationist',
    color: '#ec4899',
    description: 'Builds in silence. Emerges with overwhelming force.',
    weights: {
      reinforce: {
        adjEnemies: 1.0,
        maxEnemyArmies: 1.4,
        continentBorder: 2.2,
        nearContinent: 0.5,
        adjFriendly: 0.3,
      },
      attack: {
        completeContinent: 1.4,
        breakContinent: 0.9,
        eliminate: 0.7,
        armyAdvantage: 2.0,
        hopelessPenalty: 1.8,
      },
      grudge: 0.1,
      reputation: 0.4,
      goalWeight: 1.0,
    },
    temperature: 0.7,
    mistakeRate: 0.03,
    fatigueRate: -0.0005,
    lossAversion: 1.5,
    rubberBand: { leaderBonus: 0.0, trailerBonus: 0.0 },
    voice: { prefix: '', speechLevel: 'sparse' },
    mood: {
      onWin: 'indifferent',
      onLoss: 'withdrawn',
      onCapture: 'disturbed',
      onAttacked: 'roused',
      default: 'withdrawn',
    },
    openingBook: 'isolation',
    ruleMods: { noAttackBeforeTurn: 5 },
    preferredContinent: null,
    goalBias: 'survive',
  },
  prophet: {
    id: 'prophet',
    name: 'The Prophet',
    era: 'Divine Mandate',
    color: '#f59e0b',
    description: 'The dice bow before destiny.',
    weights: {
      reinforce: {
        adjEnemies: 1.0,
        maxEnemyArmies: 0.9,
        continentBorder: 1.2,
        nearContinent: 1.4,
        adjFriendly: 0.8,
      },
      attack: {
        completeContinent: 1.3,
        breakContinent: 1.1,
        eliminate: 1.1,
        armyAdvantage: 0.9,
        hopelessPenalty: 0.6,
      },
      grudge: 0.3,
      reputation: 0.2,
      goalWeight: 1.1,
    },
    temperature: 1.1,
    mistakeRate: 0.06,
    fatigueRate: 0.002,
    lossAversion: 0.7,
    rubberBand: { leaderBonus: 0.2, trailerBonus: -0.2 },
    voice: { prefix: '', speechLevel: 'prophetic' },
    mood: {
      onWin: 'rapturous',
      onLoss: 'tested',
      onCapture: 'ascendant',
      onAttacked: 'wrathful',
      default: 'luminous',
    },
    openingBook: null,
    ruleMods: { rerollOneLoss: true },
    preferredContinent: null,
    goalBias: 'holdContinent',
  },
};

export const ARCH_IDS = [
  'dilettante',
  'napoleon',
  'fortress',
  'jackal',
  'vengeful',
  'patient',
  'shogun',
  'hermit',
  'prophet',
] as const;

export type ArchId = (typeof ARCH_IDS)[number];

export const Arch = {
  ids: ARCH_IDS,
  list(): readonly ArchDef[] {
    return ARCH_IDS.map((id) => CATALOG[id] as ArchDef);
  },
  get(id: string): ArchDef | null {
    return CATALOG[id] ?? null;
  },
};
