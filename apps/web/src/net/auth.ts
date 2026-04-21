/**
 * Auth stub — sprint-2 stopgap while the Turnstile signup route is still
 * deferred. We treat a JWT pasted into the Lobby as the source of truth.
 *
 * Token shape is a Supabase access token (`sub` = user id). We decode the
 * `sub` claim client-side for display / seat-match purposes only; the server
 * re-verifies the JWT on every REST call + WS upgrade, so a forged token
 * here buys nothing.
 */

import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'rr_token';

export interface Auth {
  token: string | null;
  userId: string | null;
  setToken: (t: string | null) => void;
  clearToken: () => void;
}

/** Decode the `sub` claim from a Supabase JWT without verifying it. Returns
 *  `null` on anything other than a well-formed 3-segment base64url token. */
export function decodeUserId(token: string | null): string | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const payload = parts[1];
  if (!payload) return null;
  try {
    // base64url → base64
    const b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '==='.slice((b64.length + 3) % 4);
    const json = typeof atob === 'function' ? atob(padded) : '';
    if (!json) return null;
    const parsed = JSON.parse(json) as { sub?: unknown };
    return typeof parsed.sub === 'string' ? parsed.sub : null;
  } catch {
    return null;
  }
}

function readStoredToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredToken(token: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (token === null) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, token);
  } catch {
    /* storage disabled — fall through. Caller still has in-memory state. */
  }
}

/**
 * React hook returning the current JWT + a setter. Same-tab updates propagate
 * via a module-level listener set; cross-tab updates come from `storage`.
 */
const listeners = new Set<(t: string | null) => void>();
function broadcast(next: string | null): void {
  for (const fn of listeners) {
    try {
      fn(next);
    } catch (e) {
      console.warn('[auth] listener threw', e);
    }
  }
}

export function useAuth(): Auth {
  const [token, setTokenState] = useState<string | null>(() => readStoredToken());

  useEffect(() => {
    const localFn = (t: string | null): void => setTokenState(t);
    listeners.add(localFn);

    function onStorage(ev: StorageEvent): void {
      if (ev.key !== STORAGE_KEY) return;
      setTokenState(ev.newValue);
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', onStorage);
    }
    return () => {
      listeners.delete(localFn);
      if (typeof window !== 'undefined') {
        window.removeEventListener('storage', onStorage);
      }
    };
  }, []);

  const setToken = useCallback((t: string | null): void => {
    writeStoredToken(t);
    setTokenState(t);
    broadcast(t);
  }, []);

  const clearToken = useCallback((): void => {
    writeStoredToken(null);
    setTokenState(null);
    broadcast(null);
  }, []);

  return {
    token,
    userId: decodeUserId(token),
    setToken,
    clearToken,
  };
}
