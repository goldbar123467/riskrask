/**
 * Voice — narration template packs.
 * Ported verbatim from v2 `const Voice`.
 * `format(packId, event, vars, rng)` is pure and RNG-driven.
 */

import type { Rng } from '@riskrask/engine';
import { nextInt } from '@riskrask/engine';

export type VoiceEvent =
  | 'deploy'
  | 'attack'
  | 'capture'
  | 'fortify'
  | 'trade'
  | 'eliminate'
  | 'intent_aggressive'
  | 'intent_defensive'
  | 'outcome_success'
  | 'outcome_thwarted'
  | 'outcome_disaster';

export type VoicePack = Partial<Record<VoiceEvent, readonly string[]>>;

export const VOICE_PACKS: Readonly<Record<string, VoicePack | null>> = Object.freeze({
  napoleon: {
    deploy: [
      'The Emperor masses {n} at {terr}.',
      'Bonaparte stations {n} in {terr}.',
      'Troops stream into {terr}.',
    ],
    attack: [
      'The Grand Armée strikes {target} from {source}!',
      '{target} stands before the Emperor.',
    ],
    capture: ['{target} falls. The Empire expands.', 'Another prize for France. {target} is ours.'],
    fortify: [
      'The Emperor consolidates — {count} legionnaires shift to {target}.',
      'Tactical reposition: {count} to {target}.',
    ],
    trade: [
      'Spoils of war. +{value} reinforcements to the Emperor.',
      "Intelligence sold. +{value} to the Empire's coffers.",
    ],
    eliminate: [
      'Another crown falls. {name} is no more.',
      'The Emperor removes {name} from the map.',
    ],
    intent_aggressive: [
      'The Emperor masses at {source}. {target} will fall.',
      "Bonaparte's eye is on {target}.",
    ],
    intent_defensive: [
      'The Emperor consolidates. Patience precedes the strike.',
      'Bonaparte holds, for now.',
    ],
    outcome_success: [
      'The Empire extends its reach. {target} is taken.',
      'As promised. {target} is French.',
    ],
    outcome_thwarted: [
      'A temporary setback. {target} will yet be taken.',
      'Fortune hides her face — for now.',
    ],
    outcome_disaster: ['The Emperor is unamused.', 'Blood has been spent. It will be repaid.'],
  },
  fortress: {
    deploy: ['{terr} garrison grows by {n}.', 'Reinforcements settle into {terr}.'],
    attack: ['{source} strikes {target}.', 'Overwhelming force committed to {target}.'],
    capture: ['{target} taken. Position consolidated.', '{target} secured.'],
    fortify: ['{count} redeploy to {target}.', 'Garrison adjusts.'],
    trade: ['Set traded: +{value} to the garrison.'],
    eliminate: ['{name} neutralized.'],
    intent_aggressive: ['{source} prepares. {target} within reach.', 'A strike is planned.'],
    intent_defensive: [
      'The garrison holds. Patience is strategy.',
      '{reinforceFocus} receives additional troops.',
    ],
    outcome_success: ['Objective met.'],
    outcome_thwarted: ['Position held. No progress.'],
    outcome_disaster: ['Casualties sustained. Withdrawing.'],
  },
  jackal: {
    deploy: ['{terr} gets {n} — hungry dogs.', '{n} scavengers settle in {terr}.'],
    attack: ['The Jackal pounces on {target}!', '{target} looks wounded from here...'],
    capture: ['Scraps are good eating. {target} devoured.', '{target} — easy meat.'],
    fortify: ['{count} skulk into {target}.'],
    trade: ['Spoils sorted. +{value}.'],
    eliminate: ['{name} bleeds out. The pack feasts.'],
    intent_aggressive: [
      'The Jackal smells weakness. {target} tonight.',
      'Weakest first — {target}.',
    ],
    intent_defensive: ['The Jackal watches. Waits. Bides.'],
    outcome_success: ['Fed well tonight.', 'Easier than expected. {target} gone.'],
    outcome_thwarted: ['The prey got away this time.'],
    outcome_disaster: ['Wounded. Retreating to lick.'],
  },
  vengeful: {
    deploy: ['The Tsar posts {n} to {terr}. Remembering.', '{terr} fortified. {n} more swords.'],
    attack: ["The Tsar's wrath descends on {target}.", 'Vengeance rides from {source}.'],
    capture: ['{target} taken. The ledger balances — partly.', '{target} falls. More to come.'],
    fortify: ['{count} march to {target}. The wheel turns.'],
    trade: ['Intelligence, purchased in blood. +{value}.'],
    eliminate: ['{name} pays in full.', 'The Tsar crosses {name} off the list.'],
    intent_aggressive: [
      'The Tsar has not forgotten. {target} answers today.',
      'Old scores come due at {target}.',
    ],
    intent_defensive: ['The Tsar waits. The debt compounds.'],
    outcome_success: ['Justice, served cold. {target} is taken.'],
    outcome_thwarted: ["The Tsar's memory is long. Today is not the day."],
    outcome_disaster: ['Blood for blood. The reckoning is only delayed.'],
  },
  patient: {
    deploy: ['{n} arrives at {terr}. The slow work continues.', '{terr} deepens by {n}.'],
    attack: ['{source} tests {target}.', 'A measured strike on {target}.'],
    capture: ['{target} joins the flock.', 'The tree grows. {target} added.'],
    fortify: ['The shepherd reshapes the flock — {count} to {target}.'],
    trade: ['The harvest comes in. +{value}.'],
    eliminate: ["{name}'s time was shorter than expected."],
    intent_aggressive: [
      'The time is ripe. {target}.',
      '{source} moves today. Slowly, deliberately.',
    ],
    intent_defensive: ['Seasons come. Seasons go. {reinforceFocus} is tended.'],
    outcome_success: ['As foreseen. {target}.'],
    outcome_thwarted: ['Another season will do.'],
    outcome_disaster: ['An early frost. The tree endures.'],
  },
  shogun: {
    deploy: ['The Shogun posts {n} to {terr}.', 'Honor reinforces {terr} — {n} samurai.'],
    attack: [
      'Steel flashes. {source} attacks {target}.',
      'The Shogun commits banners at {target}.',
    ],
    capture: ['{target} submits. Honor upheld.', '{target} bows.'],
    fortify: ['{count} retainers shift to {target}.'],
    trade: ['Tribute received. +{value}.'],
    eliminate: ['{name} is dismissed from the field.'],
    intent_aggressive: [
      "The Shogun's banner rises over {source}. {target} is today's duty.",
      'A worthy strike — {target}.',
    ],
    intent_defensive: ['The blade is sheathed. For now.'],
    outcome_success: ['{target} bows to the Shogun.'],
    outcome_thwarted: ['Honor unstained. The strike is postponed.'],
    outcome_disaster: ['A dishonor. Meditation follows.'],
  },
  hermit: {
    deploy: ['{n} arrives at {terr}.', '{terr} +{n}.'],
    attack: ['{source} → {target}.'],
    capture: ['{target}. Taken.'],
    fortify: ['{count} → {target}.'],
    trade: ['Trade: +{value}.'],
    eliminate: ['{name}: removed.'],
    intent_aggressive: ['The hermit emerges. {target}.', 'Silence ends at {target}.'],
    intent_defensive: ['The hermit withdraws.', 'Quiet turns.'],
    outcome_success: ['{target}: done.'],
    outcome_thwarted: ['Retreat.'],
    outcome_disaster: ['Wounded. Returning to the cave.'],
  },
  prophet: {
    deploy: ['The Chosen sanctifies {terr} with {n}.', '{terr} receives {n} faithful.'],
    attack: ['{source} rises against {target} — faith over fortune!', 'Destiny calls at {target}.'],
    capture: ['{target} joins the flock. All was foretold.', 'The heavens open. {target} is ours.'],
    fortify: ['{count} faithful walk to {target}.'],
    trade: ['Divine providence. +{value}.'],
    eliminate: ["{name}'s heresy ends.", '{name}: judged.'],
    intent_aggressive: ['The Chosen sees a vision — {target}.', 'Destiny at {target}.'],
    intent_defensive: ['The Chosen prepares {reinforceFocus}. The hour approaches.'],
    outcome_success: ["Foretold. {target} is the Chosen's."],
    outcome_thwarted: ['The vision clouds. The hour is not yet.'],
    outcome_disaster: ['A trial. Faith persists.'],
  },
  dilettante: null,
});

function fillTemplate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => {
    const v = vars[k];
    return v != null ? String(v) : '';
  });
}

/**
 * format — picks a random line from the pack for the given event, fills placeholders.
 * Returns null if the pack doesn't cover the event.
 */
export function format(
  packId: string,
  event: VoiceEvent,
  vars: Record<string, string | number>,
  rng: Rng,
): string | null {
  const pack = VOICE_PACKS[packId];
  if (!pack) return null;
  const lines = pack[event];
  if (!lines || lines.length === 0) return null;
  const line = lines[nextInt(rng, lines.length)];
  if (!line) return null;
  return fillTemplate(line, vars);
}

export const Voice = {
  format,
  packs: VOICE_PACKS,
};
