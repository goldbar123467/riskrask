import { describe, expect, test } from 'bun:test';
import { emptyStats, leaderboard, recordGame } from '../src/stats.js';

describe('Stats', () => {
  test('emptyStats returns empty object', () => {
    expect(emptyStats()).toEqual({});
  });

  test('recordGame increments games and wins', () => {
    const stats = emptyStats();
    const outcomes = [
      { archId: 'napoleon', won: true },
      { archId: 'fortress', won: false },
    ];
    const next = recordGame(stats, outcomes);
    expect(next['napoleon']?.games).toBe(1);
    expect(next['napoleon']?.wins).toBe(1);
    expect(next['napoleon']?.losses).toBe(0);
    expect(next['fortress']?.games).toBe(1);
    expect(next['fortress']?.wins).toBe(0);
    expect(next['fortress']?.losses).toBe(1);
  });

  test('recordGame is pure — does not mutate input', () => {
    const stats = emptyStats();
    const orig = JSON.stringify(stats);
    recordGame(stats, [{ archId: 'napoleon', won: true }]);
    expect(JSON.stringify(stats)).toBe(orig);
  });

  test('recordGame skips null archId', () => {
    const stats = emptyStats();
    const next = recordGame(stats, [{ archId: null, won: true }]);
    expect(Object.keys(next)).toHaveLength(0);
  });

  test('leaderboard sorts by winRate descending', () => {
    let stats = emptyStats();
    stats = recordGame(stats, [{ archId: 'napoleon', won: true }]);
    stats = recordGame(stats, [{ archId: 'fortress', won: false }]);
    stats = recordGame(stats, [{ archId: 'fortress', won: false }]);
    const board = leaderboard(stats);
    expect(board[0]?.id).toBe('napoleon');
    expect(board[0]?.winRate).toBe(1);
    expect(board[1]?.winRate).toBe(0);
  });

  test('leaderboard handles empty stats', () => {
    expect(leaderboard(emptyStats())).toEqual([]);
  });

  test('multiple games accumulate correctly', () => {
    let stats = emptyStats();
    for (let i = 0; i < 10; i++) {
      stats = recordGame(stats, [{ archId: 'napoleon', won: i % 2 === 0 }]);
    }
    expect(stats['napoleon']?.games).toBe(10);
    expect(stats['napoleon']?.wins).toBe(5);
    expect(stats['napoleon']?.losses).toBe(5);
  });
});
