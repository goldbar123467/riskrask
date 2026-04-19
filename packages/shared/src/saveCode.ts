import { SAVE_ALPHABET, SAVE_CODE_RE } from './index';

export { SAVE_ALPHABET, SAVE_CODE_RE };

export function formatSaveCode(raw: string): string {
  const up = raw.toUpperCase();
  return up.length === 8 ? `${up.slice(0, 4)}-${up.slice(4)}` : up;
}

export function parseSaveCode(input: string): string | null {
  const stripped = input.replace(/[\s-]/g, '').toUpperCase();
  return SAVE_CODE_RE.test(stripped) ? stripped : null;
}

export function isSaveCode(input: string): boolean {
  return parseSaveCode(input) !== null;
}
