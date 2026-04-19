/**
 * Typed Supabase client factory.
 *
 * Two clients:
 *  - serviceClient()  — uses the service role key; bypasses RLS.
 *                        Used for all authoritative server writes.
 *  - anonClient(jwt?) — uses the anon key; respects RLS.
 *                        Pass user JWT to act on behalf of a user.
 */

import { type SupabaseClient, createClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Database type stubs — extend as tables are fully typed.
// Using a minimal interface keeps this package compilable before full codegen.
// ---------------------------------------------------------------------------
export interface Database {
  public: {
    Tables: {
      saves: {
        Row: {
          code: string;
          state_json: Record<string, unknown>;
          schema_version: number;
          owner_id: string | null;
          created_at: string;
          expires_at: string | null;
          last_loaded_at: string | null;
          load_count: number;
        };
        Insert: {
          code?: string;
          state_json: Record<string, unknown>;
          schema_version: number;
          owner_id?: string | null;
          expires_at?: string | null;
          last_loaded_at?: string | null;
          load_count?: number;
        };
        Update: Partial<Database['public']['Tables']['saves']['Insert']>;
      };
      profiles: {
        Row: {
          id: string;
          username: string;
          display_name: string | null;
          created_at: string;
          banned: boolean;
          arch_stats: Record<string, unknown>;
          player_stats: Record<string, unknown>;
        };
        Insert: Omit<Database['public']['Tables']['profiles']['Row'], 'created_at'>;
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>;
      };
    };
    Functions: {
      create_save_with_expiry: {
        Args: {
          p_state_json: Record<string, unknown>;
          p_schema_version: number;
          p_owner_id?: string | null;
        };
        Returns: { code: string; expires_at: string | null }[];
      };
      generate_room_code: {
        Args: Record<string, never>;
        Returns: string;
      };
    };
  };
}

export type TypedSupabaseClient = SupabaseClient<Database>;

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

/**
 * Service-role client — bypasses RLS.
 * Should only be used in server-side code that has already performed its own
 * authorization checks.
 */
export function serviceClient(): TypedSupabaseClient {
  return createClient<Database>(
    requireEnv('SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
  );
}

/**
 * Anon client — respects RLS.
 * Optionally forwards the end-user JWT so queries run as that user.
 */
export function anonClient(userJwt?: string): TypedSupabaseClient {
  const headers: Record<string, string> = {};
  if (userJwt) headers.Authorization = `Bearer ${userJwt}`;
  return createClient<Database>(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_ANON_KEY'), {
    global: { headers },
  });
}

// ---------------------------------------------------------------------------
// Edge-function URL helper
// ---------------------------------------------------------------------------
export function edgeFunctionUrl(name: string): string {
  const base = process.env.SUPABASE_FUNCTIONS_URL ?? `${requireEnv('SUPABASE_URL')}/functions/v1`;
  return `${base}/${name}`;
}
