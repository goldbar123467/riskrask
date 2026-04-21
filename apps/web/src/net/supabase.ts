/**
 * Supabase browser client singleton.
 *
 * The client persists the session to localStorage under the key
 * `sb-<ref>-auth-token` (handled by supabase-js). Access tokens refresh
 * automatically; consumers read the current JWT via `useAuth()` in `auth.ts`.
 *
 * Env (Vite compile-time):
 *   VITE_SUPABASE_URL       — https://<project>.supabase.co
 *   VITE_SUPABASE_ANON_KEY  — public anon key
 *   VITE_TURNSTILE_SITE_KEY — optional; when present the signup form shows the
 *                             Turnstile widget and forwards the captcha token
 *                             to supabase.auth.signUp({ options.captchaToken }).
 */

import { type SupabaseClient, createClient } from '@supabase/supabase-js';

const URL = import.meta.env.VITE_SUPABASE_URL ?? '';
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

export const TURNSTILE_SITE_KEY: string = import.meta.env.VITE_TURNSTILE_SITE_KEY ?? '';

let _client: SupabaseClient | null = null;

/**
 * Lazily-initialised singleton. Returns `null` when env vars are missing so
 * the UI can fall back to a friendly "auth unavailable" state instead of
 * throwing at import time (e.g. in tests / Storybook).
 */
export function getSupabase(): SupabaseClient | null {
  if (_client) return _client;
  if (!URL || !KEY) return null;
  _client = createClient(URL, KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'rr-supabase-auth',
    },
  });
  return _client;
}

/** True iff VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY are both set. */
export function isSupabaseConfigured(): boolean {
  return Boolean(URL && KEY);
}
