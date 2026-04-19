import { describe, expect, test } from 'bun:test';
import { Arch } from '../src/arch.js';
import { Mood } from '../src/mood.js';

describe('Mood', () => {
  test('computeMood returns default mood when no events', () => {
    const arch = Arch.get('napoleon')!;
    expect(Mood.compute(arch, [])).toBe('confident'); // napoleon default
  });

  test('computeMood returns onCapture when last event is captured', () => {
    const arch = Arch.get('napoleon')!;
    expect(Mood.compute(arch, ['captured'])).toBe('victorious');
  });

  test('computeMood returns onAttacked when last event is attacked', () => {
    const arch = Arch.get('napoleon')!;
    expect(Mood.compute(arch, ['attacked'])).toBe('insulted');
  });

  test('computeMood returns onWin when last event is won', () => {
    const arch = Arch.get('fortress')!;
    expect(Mood.compute(arch, ['won'])).toBe('stoic');
  });

  test('moodIcon returns an object with glyph and color', () => {
    const icon = Mood.icon('triumphant');
    expect(icon.glyph).toBeTruthy();
    expect(icon.color).toMatch(/^#/);
  });

  test('moodIcon falls back to neutral for unknown mood', () => {
    const icon = Mood.icon('unknown-mood-xyz');
    expect(icon.glyph).toBe('·');
  });

  test('recordMoodEvent prepends and caps at 3', () => {
    let events: readonly string[] = [];
    events = Mood.record(events, 'captured');
    events = Mood.record(events, 'attacked');
    events = Mood.record(events, 'won');
    events = Mood.record(events, 'lost'); // should drop 'captured'
    expect(events.length).toBe(3);
    expect(events[0]).toBe('lost');
    expect(events[2]).toBe('attacked');
  });

  test('all archetype mood fields map to known mood icons', () => {
    for (const arch of Arch.list()) {
      for (const moodKey of ['onWin', 'onLoss', 'onCapture', 'onAttacked', 'default'] as const) {
        const moodName = arch.mood[moodKey];
        const icon = Mood.icon(moodName);
        expect(icon).toBeDefined();
      }
    }
  });
});
