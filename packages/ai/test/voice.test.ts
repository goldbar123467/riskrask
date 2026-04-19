import { describe, expect, test } from 'bun:test';
import { createRng } from '@riskrask/engine';
import { ARCH_IDS } from '../src/arch.js';
import { VOICE_PACKS, Voice } from '../src/voice.js';
import type { VoiceEvent } from '../src/voice.js';

const EXPECTED_EVENTS: VoiceEvent[] = [
  'deploy',
  'attack',
  'capture',
  'fortify',
  'trade',
  'eliminate',
  'intent_aggressive',
  'intent_defensive',
  'outcome_success',
  'outcome_thwarted',
  'outcome_disaster',
];

describe('Voice', () => {
  test('every non-null pack has entries for all event types', () => {
    for (const archId of ARCH_IDS) {
      const pack = VOICE_PACKS[archId];
      if (!pack) continue; // dilettante is null — intentional
      for (const event of EXPECTED_EVENTS) {
        const lines = pack[event];
        expect(lines).toBeDefined();
        expect((lines ?? []).length).toBeGreaterThan(0);
      }
    }
  });

  test('format returns a string for napoleon deploy', () => {
    const rng = createRng('voice-test');
    const result = Voice.format('napoleon', 'deploy', { n: 3, terr: 'France' }, rng);
    expect(typeof result).toBe('string');
    expect(result?.length).toBeGreaterThan(0);
  });

  test('format fills placeholders', () => {
    const rng = createRng('placeholder-test');
    const result = Voice.format('napoleon', 'capture', { target: 'Moscow' }, rng);
    expect(result).toContain('Moscow');
  });

  test('format returns null for dilettante (null pack)', () => {
    const rng = createRng('null-test');
    const result = Voice.format('dilettante', 'deploy', {}, rng);
    expect(result).toBeNull();
  });

  test('format is deterministic given same seed', () => {
    const vars = { n: 5, terr: 'Siberia' };
    const r1 = Voice.format('napoleon', 'deploy', vars, createRng('det'));
    const r2 = Voice.format('napoleon', 'deploy', vars, createRng('det'));
    expect(r1).toBe(r2);
  });

  test('format returns null for unknown pack', () => {
    const rng = createRng('unk');
    expect(Voice.format('unknown-pack', 'deploy', {}, rng)).toBeNull();
  });
});
