import { describe, expect, test } from 'bun:test';
import { AI_SENTINEL } from '../src';

describe('ai scaffold', () => {
  test('exports sentinel until Track C lands real AI', () => {
    expect(AI_SENTINEL).toBe('riskrask-ai');
  });
});
