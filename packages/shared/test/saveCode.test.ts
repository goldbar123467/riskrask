import { describe, expect, test } from 'bun:test';
import {
  CURRENT_SCHEMA_VERSION,
  ROOM_CODE_RE,
  SAVE_ALPHABET,
  SAVE_CODE_RE,
  formatSaveCode,
  isSaveCode,
  parseSaveCode,
} from '../src';

describe('save code', () => {
  test('alphabet excludes ambiguous glyphs', () => {
    for (const bad of ['0', 'O', '1', 'I', 'L']) {
      expect(SAVE_ALPHABET).not.toContain(bad);
    }
    expect(SAVE_ALPHABET).toHaveLength(31);
  });

  test('regex matches 8-char codes from the alphabet only', () => {
    expect(SAVE_CODE_RE.test('ABCD2345')).toBe(true);
    expect(SAVE_CODE_RE.test('ABCD234')).toBe(false);
    expect(SAVE_CODE_RE.test('ABCD23450')).toBe(false);
    expect(SAVE_CODE_RE.test('ABCD234O')).toBe(false);
    expect(SAVE_CODE_RE.test('ABCD234L')).toBe(false);
    expect(SAVE_CODE_RE.test('abcd2345')).toBe(false);
  });

  test('formatSaveCode adds a hyphen mid-code', () => {
    expect(formatSaveCode('ABCD2345')).toBe('ABCD-2345');
    expect(formatSaveCode('abcd2345')).toBe('ABCD-2345');
  });

  test('parseSaveCode is hyphen-tolerant and case-insensitive', () => {
    expect(parseSaveCode('ABCD-2345')).toBe('ABCD2345');
    expect(parseSaveCode('abcd2345')).toBe('ABCD2345');
    expect(parseSaveCode('  abcd 2345 ')).toBe('ABCD2345');
    expect(parseSaveCode('NOPE')).toBeNull();
    expect(parseSaveCode('ABCD234O')).toBeNull();
    expect(parseSaveCode('ABCD234L')).toBeNull();
  });

  test('isSaveCode mirrors parseSaveCode', () => {
    expect(isSaveCode('ABCD-2345')).toBe(true);
    expect(isSaveCode('NOPE')).toBe(false);
  });

  test('room code regex is 6 chars, same alphabet', () => {
    expect(ROOM_CODE_RE.test('ABCDEF')).toBe(true);
    expect(ROOM_CODE_RE.test('ABCDE0')).toBe(false);
  });

  test('schema version is 1 at scaffold', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(1);
  });
});
