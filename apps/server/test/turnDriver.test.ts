/**
 * TurnDriver — unit tests with a manual timer queue.
 *
 * The driver is pure scheduling; exercising it with the real clock would
 * bake flakiness into the suite. Instead we inject a synthetic queue so
 * every test deterministically controls "now" and "has-fired".
 */

import { describe, expect, test } from 'bun:test';
import { TurnDriver } from '../src/rooms/turnDriver';

interface Scheduled {
  fn: () => void;
  fireAt: number;
  cancelled: boolean;
}

function makeFakeClock() {
  let now = 0;
  const queue: Scheduled[] = [];
  return {
    now: () => now,
    advanceTo(target: number): void {
      now = target;
      for (const entry of queue) {
        if (!entry.cancelled && entry.fireAt <= target) {
          entry.cancelled = true;
          entry.fn();
        }
      }
    },
    advanceBy(ms: number): void {
      this.advanceTo(now + ms);
    },
    setTimeout: (fn: () => void, ms: number): Scheduled => {
      const entry: Scheduled = { fn, fireAt: now + ms, cancelled: false };
      queue.push(entry);
      return entry;
    },
    clearTimeout: (entry: Scheduled): void => {
      entry.cancelled = true;
    },
    pending(): number {
      return queue.filter((e) => !e.cancelled).length;
    },
  };
}

function makeDriver(clock: ReturnType<typeof makeFakeClock>): TurnDriver {
  return new TurnDriver({
    now: clock.now,
    setTimeout: clock.setTimeout as never,
    clearTimeout: clock.clearTimeout as never,
  });
}

describe('TurnDriver', () => {
  test('start schedules onExpire to fire after durationMs', () => {
    const clock = makeFakeClock();
    const driver = makeDriver(clock);
    let fired = 0;
    driver.start('r1', 30_000, () => fired++);

    clock.advanceBy(29_999);
    expect(fired).toBe(0);
    clock.advanceBy(1);
    expect(fired).toBe(1);
  });

  test('getDeadline returns absolute epoch-ms until fire', () => {
    const clock = makeFakeClock();
    clock.advanceBy(1_000); // now = 1000
    const driver = makeDriver(clock);
    driver.start('r1', 5_000, () => {});
    expect(driver.getDeadline('r1')).toBe(6_000);
    clock.advanceBy(5_000);
    expect(driver.getDeadline('r1')).toBe(null);
  });

  test('cancel stops a pending timer and clears the deadline', () => {
    const clock = makeFakeClock();
    const driver = makeDriver(clock);
    let fired = 0;
    driver.start('r1', 10_000, () => fired++);
    expect(driver.getDeadline('r1')).not.toBeNull();
    driver.cancel('r1');
    expect(driver.getDeadline('r1')).toBeNull();
    clock.advanceBy(50_000);
    expect(fired).toBe(0);
  });

  test('cancel is idempotent on unknown rooms', () => {
    const clock = makeFakeClock();
    const driver = makeDriver(clock);
    expect(() => driver.cancel('ghost')).not.toThrow();
  });

  test('start replaces an existing timer for the same room', () => {
    const clock = makeFakeClock();
    const driver = makeDriver(clock);
    const firings: string[] = [];
    driver.start('r1', 10_000, () => firings.push('first'));
    clock.advanceBy(5_000);
    // Reschedule mid-flight. The old callback must never fire.
    driver.start('r1', 10_000, () => firings.push('second'));
    clock.advanceBy(5_000);
    expect(firings).toEqual([]); // first should be dead
    clock.advanceBy(5_000);
    expect(firings).toEqual(['second']);
  });

  test('tracks multiple rooms in parallel', () => {
    const clock = makeFakeClock();
    const driver = makeDriver(clock);
    const fires: string[] = [];
    driver.start('room-a', 5_000, () => fires.push('a'));
    driver.start('room-b', 10_000, () => fires.push('b'));
    driver.start('room-c', 15_000, () => fires.push('c'));

    clock.advanceBy(5_000);
    expect(fires).toEqual(['a']);
    clock.advanceBy(5_000);
    expect(fires).toEqual(['a', 'b']);
    clock.advanceBy(5_000);
    expect(fires).toEqual(['a', 'b', 'c']);
  });

  test('getDeadline returns null for unknown rooms', () => {
    const clock = makeFakeClock();
    const driver = makeDriver(clock);
    expect(driver.getDeadline('nope')).toBeNull();
  });

  test('shutdown cancels every active timer', () => {
    const clock = makeFakeClock();
    const driver = makeDriver(clock);
    let fired = 0;
    driver.start('r1', 5_000, () => fired++);
    driver.start('r2', 10_000, () => fired++);
    driver.shutdown();
    clock.advanceBy(100_000);
    expect(fired).toBe(0);
  });
});
