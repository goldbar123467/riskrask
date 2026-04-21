/**
 * Auth hook — real Supabase signup/login.
 *
 * The hook reads the current access token from `supabase.auth.getSession()`
 * and subscribes to `onAuthStateChange` so signin/signout/refresh propagate
 * instantly across components without prop-drilling.
 *
 * For tests and for devs who still want to paste a token, a localStorage
 * override at `rr_token` is honoured when Supabase is not configured (e.g.
 * jsdom). This keeps the existing `Lobby.test.tsx` harness working.
 */

import type { Session } from '@supabase/supabase-js';
import { useCallback, useEffect, useState } from 'react';
import { getSupabase, isSupabaseConfigured } from './supabase';

const LEGACY_TOKEN_KEY = 'rr_token';

export interface Auth {
  token: string | null;
  userId: string | null;
  email: string | null;
  /** Legacy escape hatch — only honoured when Supabase isn't configured. */
  setToken: (t: string | null) => void;
  /** Signs out the current Supabase session (or clears the legacy override). */
  clearToken: () => void;
}

/** Decode the `sub` claim from a JWT without verifying it. */
export function decodeUserId(token: string | null): string | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const payload = parts[1];
  if (!payload) return null;
  try {
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

function readLegacy(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(LEGACY_TOKEN_KEY);
  } catch {
    return null;
  }
}

function writeLegacy(token: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (token === null) window.localStorage.removeItem(LEGACY_TOKEN_KEY);
    else window.localStorage.setItem(LEGACY_TOKEN_KEY, token);
  } catch {
    /* storage disabled — swallow */
  }
}

interface SnapshotShape {
  token: string | null;
  userId: string | null;
  email: string | null;
}

function snapshotFromSession(session: Session | null): SnapshotShape {
  if (!session) return { token: null, userId: null, email: null };
  return {
    token: session.access_token,
    userId: session.user.id,
    email: session.user.email ?? null,
  };
}

function snapshotFromLegacy(token: string | null): SnapshotShape {
  return {
    token,
    userId: decodeUserId(token),
    email: null,
  };
}

const legacyListeners = new Set<(t: string | null) => void>();
function broadcastLegacy(next: string | null): void {
  for (const fn of legacyListeners) {
    try {
      fn(next);
    } catch (e) {
      console.warn('[auth] legacy listener threw', e);
    }
  }
}

export function useAuth(): Auth {
  const configured = isSupabaseConfigured();
  const [snap, setSnap] = useState<SnapshotShape>(() => {
    if (configured) return { token: null, userId: null, email: null };
    return snapshotFromLegacy(readLegacy());
  });

  useEffect(() => {
    if (configured) {
      const supa = getSupabase();
      if (!supa) return;
      let cancelled = false;

      void supa.auth.getSession().then(({ data }) => {
        if (cancelled) return;
        setSnap(snapshotFromSession(data.session));
      });

      const { data: sub } = supa.auth.onAuthStateChange((_event, session) => {
        setSnap(snapshotFromSession(session));
      });

      return () => {
        cancelled = true;
        sub.subscription.unsubscribe();
      };
    }

    // Legacy path — listen for same-tab + cross-tab updates of rr_token.
    const localFn = (t: string | null): void => setSnap(snapshotFromLegacy(t));
    legacyListeners.add(localFn);
    function onStorage(ev: StorageEvent): void {
      if (ev.key !== LEGACY_TOKEN_KEY) return;
      setSnap(snapshotFromLegacy(ev.newValue));
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', onStorage);
    }
    return () => {
      legacyListeners.delete(localFn);
      if (typeof window !== 'undefined') {
        window.removeEventListener('storage', onStorage);
      }
    };
  }, [configured]);

  const setToken = useCallback(
    (t: string | null): void => {
      if (configured) {
        console.warn('[auth] setToken is a no-op when Supabase is configured; use signIn instead.');
        return;
      }
      writeLegacy(t);
      setSnap(snapshotFromLegacy(t));
      broadcastLegacy(t);
    },
    [configured],
  );

  const clearToken = useCallback((): void => {
    if (configured) {
      const supa = getSupabase();
      if (supa) void supa.auth.signOut();
      return;
    }
    writeLegacy(null);
    setSnap(snapshotFromLegacy(null));
    broadcastLegacy(null);
  }, [configured]);

  return {
    token: snap.token,
    userId: snap.userId,
    email: snap.email,
    setToken,
    clearToken,
  };
}
