/**
 * @riskrask/ai — public API
 */

// Kept for backward compatibility with pre-Track-C sentinel test
export const AI_SENTINEL = 'riskrask-ai' as const;

export { Arch, ARCH_IDS } from './arch.js';
export type { ArchDef, ArchId, ArchWeights, RuleMods } from './arch.js';

export {
  Persona,
  createPersonaState,
  scoreReinforce,
  scoreAttack,
  scoreFortifyOptions,
} from './persona.js';
export type { PersonaState, RuntimeWeights, ScoredOption } from './persona.js';

export { Voice, format as voiceFormat } from './voice.js';
export type { VoiceEvent, VoicePack } from './voice.js';

export { Rep } from './rep.js';
export type { RepMatrix } from './rep.js';

export { Grudge } from './grudge.js';
export type { GrudgeMap, GrudgeEntry } from './grudge.js';

export {
  Goal,
  GoalTypes,
  assignGoal,
  goalProgress,
  isGoalComplete,
  goalBonus,
  onCaptureGoalUpdate,
} from './goal.js';
export type { Goal as GoalDef, GoalType } from './goal.js';

export { Plan, composePlan, evaluatePlan } from './plan.js';
export type { TurnPlan, AttackIntent, PlanOutcome } from './plan.js';

export { Mood, computeMood, moodIcon, recordMoodEvent } from './mood.js';
export type { MoodEvent, MoodIcon } from './mood.js';

export { Book } from './book.js';
export type { BookDef } from './book.js';

export { Rule } from './rule.js';

export { Regret, updateRegret, resetRegret, expectedLoss } from './regret.js';

export { Band, standing, recalibrate } from './band.js';

export { recordGame, emptyStats, leaderboard } from './stats.js';
export type { ArchStats, ArchStatsBlob, PlayerOutcome } from './stats.js';

export { takeTurn } from './orchestrator.js';

export { takeSetupAction } from './setup.js';
