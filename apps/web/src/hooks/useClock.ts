import { useEffect, useState } from 'react';

/**
 * Countdown from deadlineMs (epoch ms). Returns remaining seconds.
 * Solo mode: decorative only (no server deadline → returns null).
 * Multiplayer: supplied by server timer messages.
 */
export function useClock(deadlineMs?: number): number | null {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (!deadlineMs) {
      setRemaining(null);
      return;
    }

    function tick() {
      const diff = Math.max(0, deadlineMs! - Date.now());
      setRemaining(Math.ceil(diff / 1000));
    }

    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [deadlineMs]);

  return remaining;
}
