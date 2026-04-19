import { useEffect } from 'react';

type HotkeyHandler = (e: KeyboardEvent) => void;

/**
 * Registers a keydown listener for the given key.
 * Keys are matched case-insensitively for letters.
 */
export function useHotkey(key: string, handler: HotkeyHandler): void {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      // Don't trigger when typing in inputs
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }
      if (e.key === key || e.key.toLowerCase() === key.toLowerCase()) {
        handler(e);
      }
    }

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [key, handler]);
}

/** Convenience wrapper for multiple keys */
export function useHotkeys(
  bindings: Record<string, HotkeyHandler>,
): void {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }
      const handler = bindings[e.key] ?? bindings[e.key.toLowerCase()];
      handler?.(e);
    }

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [bindings]);
}
