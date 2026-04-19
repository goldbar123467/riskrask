import { describe, expect, test } from 'bun:test';
import { ENGINE_SENTINEL } from '../src';

describe('engine scaffold', () => {
  test('exports sentinel until Track B lands real engine', () => {
    expect(ENGINE_SENTINEL).toBe('riskrask-engine');
  });
});
