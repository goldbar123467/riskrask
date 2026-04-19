/**
 * Server-side tests for save code utilities and migration registry.
 * These mirror the shared package tests but run in the Bun server test suite
 * so CI catches breakage in the server workspace too.
 */

import { describe, expect, test } from 'bun:test';
import {
  CURRENT_SCHEMA_VERSION,
  MIGRATIONS,
  SAVE_ALPHABET,
  SAVE_CODE_RE,
  assertMigrationRegistryIsComplete,
  formatSaveCode,
  isSaveCode,
  migrateSave,
  parseSaveCode,
} from '@riskrask/shared';

describe('SAVE_ALPHABET', () => {
  test('has 31 characters', () => {
    expect(SAVE_ALPHABET).toHaveLength(31);
  });

  test('excludes ambiguous glyphs 0 O 1 I L', () => {
    for (const bad of ['0', 'O', '1', 'I', 'L']) {
      expect(SAVE_ALPHABET).not.toContain(bad);
    }
  });

  test('contains no duplicates', () => {
    const chars = SAVE_ALPHABET.split('');
    expect(new Set(chars).size).toBe(chars.length);
  });
});

describe('SAVE_CODE_RE', () => {
  test('accepts valid 8-char code', () => {
    expect(SAVE_CODE_RE.test('ABCD2345')).toBe(true);
  });

  test('rejects 7-char code', () => {
    expect(SAVE_CODE_RE.test('ABCD234')).toBe(false);
  });

  test('rejects 9-char code', () => {
    expect(SAVE_CODE_RE.test('ABCD23456')).toBe(false);
  });

  test('rejects lowercase', () => {
    expect(SAVE_CODE_RE.test('abcd2345')).toBe(false);
  });

  test('rejects excluded glyphs', () => {
    expect(SAVE_CODE_RE.test('ABCD234O')).toBe(false);
    expect(SAVE_CODE_RE.test('ABCD234L')).toBe(false);
    expect(SAVE_CODE_RE.test('ABCD2340')).toBe(false);
    expect(SAVE_CODE_RE.test('ABCD234I')).toBe(false);
  });
});

describe('formatSaveCode', () => {
  test('inserts hyphen after 4th char', () => {
    expect(formatSaveCode('ABCD2345')).toBe('ABCD-2345');
  });

  test('uppercases before formatting', () => {
    expect(formatSaveCode('abcd2345')).toBe('ABCD-2345');
  });
});

describe('parseSaveCode', () => {
  test('accepts plain 8-char code', () => {
    expect(parseSaveCode('ABCD2345')).toBe('ABCD2345');
  });

  test('accepts hyphenated format', () => {
    expect(parseSaveCode('ABCD-2345')).toBe('ABCD2345');
  });

  test('accepts lowercase input', () => {
    expect(parseSaveCode('abcd2345')).toBe('ABCD2345');
  });

  test('strips whitespace', () => {
    expect(parseSaveCode('  abcd 2345 ')).toBe('ABCD2345');
  });

  test('returns null for too-short code', () => {
    expect(parseSaveCode('NOPE')).toBeNull();
  });

  test('returns null for excluded glyphs', () => {
    expect(parseSaveCode('ABCD234O')).toBeNull();
    expect(parseSaveCode('ABCD234L')).toBeNull();
  });
});

describe('isSaveCode', () => {
  test('mirrors parseSaveCode', () => {
    expect(isSaveCode('ABCD-2345')).toBe(true);
    expect(isSaveCode('NOPE')).toBe(false);
  });
});

describe('migration registry CI guard', () => {
  test('assertMigrationRegistryIsComplete passes at v1', () => {
    expect(() => assertMigrationRegistryIsComplete()).not.toThrow();
  });

  test('registry is empty (no migrations yet at v1)', () => {
    expect(MIGRATIONS).toHaveLength(0);
  });

  test('CURRENT_SCHEMA_VERSION is 1 at scaffold', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(1);
  });
});

describe('migrateSave', () => {
  test('no-op on current version', () => {
    const blob = { schemaVersion: CURRENT_SCHEMA_VERSION };
    const result = migrateSave(blob);
    expect((result as { schemaVersion: number }).schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  test('throws on invalid input', () => {
    expect(() => migrateSave(null)).toThrow();
    expect(() => migrateSave({ noVersion: true })).toThrow();
  });
});
