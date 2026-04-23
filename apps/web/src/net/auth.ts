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
  /**
   * Resolved profile display name for the current user — populated after a
   * `fetchMyProfile` call by whatever route/component orchestrates the
   * lookup. Null until set. Cleared on sign-out.
   */
  displayName: string | null;
  /**
   * True while the Supabase session is being hydrated on first mount.
   * Consumers should treat `token=null` as "still loading" when this is
   * true, NOT as "no session". Always false in the legacy (paste-token)
   * path since that hydrates synchronously from localStorage.
   */
  hydrating: boolean;
  /** Legacy escape hatch — only honoured when Supabase isn't configured. */
  setToken: (t: string | null) => void;
  /** Signs out the current Supabase session (or clears the legacy override). */
  clearToken: () => void;
  /** Cache the caller's resolved profile display name. Null unsets. */
  setDisplayName: (name: string | null) => void;
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

// ---------------------------------------------------------------------------
// Display-name cache — module-level so every useAuth consumer sees the same
// value without re-fetching. The Lobby populates it after profile fetch;
// sign-out clears it.
// ---------------------------------------------------------------------------

let displayNameCache: string | null = null;
const displayNameListeners = new Set<(name: string | null) => void>();
function broadcastDisplayName(next: string | null): void {
  displayNameCache = next;
  for (const fn of displayNameListeners) {
    try {
      fn(next);
    } catch (e) {
      console.warn('[auth] displayName listener threw', e);
    }
  }
}

export function useAuth(): Auth {
  const configured = isSupabaseConfigured();
  const [snap, setSnap] = useState<SnapshotShape>(() => {
    if (configured) return { token: null, userId: null, email: null };
    return snapshotFromLegacy(readLegacy());
  });
  // Legacy path hydrates synchronously from localStorage in the useState
  // initializer above, so we're never "hydrating" there. Supabase path
  // has to wait for an async getSession() round-trip; until that settles,
  // `token=null` must NOT be interpreted as "no session".
  const [hydrating, setHydrating] = useState<boolean>(configured);
  const [displayName, setDisplayNameState] = useState<string | null>(displayNameCache);

  useEffect(() => {
    if (configured) {
      const supa = getSupabase();
      if (!supa) {
        // No Supabase client available despite `configured` — flush the
        // hydrating flag so consumers don't wait forever.
        setHydrating(false);
        return;
      }
      let cancelled = false;

      void supa.auth.getSession().then(({ data }) => {
        if (cancelled) return;
        setSnap(snapshotFromSession(data.session));
        setHydrating(false);
      });

      const { data: sub } = supa.auth.onAuthStateChange((event, session) => {
        setSnap(snapshotFromSession(session));
        // First `onAuthStateChange` callback also resolves the hydrating
        // window — flip the flag defensively in case `getSession()` lost
        // the race.
        setHydrating(false);
        // Drop any cached display-name on sign-out so the next signed-in user
        // doesn't see the previous account's name.
        if (event === 'SIGNED_OUT') broadcastDisplayName(null);
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

  // Subscribe to the module-level displayName cache so every useAuth
  // consumer re-renders when the Lobby (or anywhere else) resolves it.
  useEffect(() => {
    const fn = (name: string | null): void => setDisplayNameState(name);
    displayNameListeners.add(fn);
    // Sync late-mounts to the current cached value.
    setDisplayNameState(displayNameCache);
    return () => {
      displayNameListeners.delete(fn);
    };
  }, []);

  const setToken = useCallback(
    (t: string | null): void => {
      if (configured) {
        console.warn('[auth] setToken is a no-op when Supabase is configured; use signIn instead.');
        return;
      }
      writeLegacy(t);
      setSnap(snapshotFromLegacy(t));
      broadcastLegacy(t);
      // Legacy-token flip implies a session change — drop stale displayName.
      if (t === null) broadcastDisplayName(null);
    },
    [configured],
  );

  const clearToken = useCallback((): void => {
    // Always clear the cached display name on sign-out regardless of mode.
    broadcastDisplayName(null);
    if (configured) {
      const supa = getSupabase();
      if (supa) void supa.auth.signOut();
      return;
    }
    writeLegacy(null);
    setSnap(snapshotFromLegacy(null));
    broadcastLegacy(null);
  }, [configured]);

  const setDisplayName = useCallback((name: string | null): void => {
    broadcastDisplayName(name);
  }, []);

  return {
    token: snap.token,
    userId: snap.userId,
    email: snap.email,
    displayName,
    hydrating,
    setToken,
    clearToken,
    setDisplayName,
  };
}
