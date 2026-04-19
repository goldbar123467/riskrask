/**
 * Persistence helpers for the saves table.
 *
 * All writes use the service client (bypasses RLS).
 * All reads go through the load-save edge function or direct service client.
 */

import { migrateSave } from '@riskrask/shared';
import type { SupabaseClient } from '@supabase/supabase-js';

// We accept the generic SupabaseClient here to avoid fighting the strict
// Database type parameters when calling .rpc() and .update() — the typed
// client is still used at call sites for construction safety.
type AnyClient = SupabaseClient;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface SaveRow {
  code: string;
  state_json: Record<string, unknown>;
  schema_version: number;
  owner_id: string | null;
  created_at: string;
  expires_at: string | null;
  last_loaded_at: string | null;
  load_count: number;
}

export interface CreateSaveInput {
  stateJson: Record<string, unknown>;
  schemaVersion: number;
  ownerId?: string;
}

export interface CreateSaveResult {
  code: string;
  expiresAt: string | null;
}

// ---------------------------------------------------------------------------
// createSave()
// ---------------------------------------------------------------------------
export async function createSave(
  client: AnyClient,
  input: CreateSaveInput,
): Promise<CreateSaveResult> {
  const { data, error } = await client.rpc('create_save_with_expiry', {
    p_state_json: input.stateJson,
    p_schema_version: input.schemaVersion,
    p_owner_id: input.ownerId ?? null,
  });

  if (error || !data || (data as unknown[]).length === 0) {
    throw new Error(`createSave failed: ${error?.message ?? 'no data returned'}`);
  }

  const row = (data as { code: string; expires_at: string | null }[])[0]!;
  return { code: row.code, expiresAt: row.expires_at };
}

// ---------------------------------------------------------------------------
// loadSave()
// Fetches the save, checks expiry, runs migration, increments stats.
// Returns null when not found.
// Throws with code SAVE_EXPIRED when expired.
// ---------------------------------------------------------------------------
export class SaveExpiredError extends Error {
  readonly code = 'SAVE_EXPIRED';
  constructor() {
    super('save has expired');
  }
}

export async function loadSave(
  client: AnyClient,
  code: string,
): Promise<{ state: unknown; schemaVersion: number; row: SaveRow } | null> {
  const { data, error } = await client
    .from('saves')
    .select(
      'code, state_json, schema_version, owner_id, created_at, expires_at, last_loaded_at, load_count',
    )
    .eq('code', code)
    .maybeSingle();

  if (error) throw new Error(`loadSave query failed: ${error.message}`);
  if (!data) return null;

  const row = data as SaveRow;
  if (row.expires_at !== null && new Date(row.expires_at) < new Date()) {
    throw new SaveExpiredError();
  }

  // Fire-and-forget stats
  client
    .from('saves')
    .update({
      last_loaded_at: new Date().toISOString(),
      load_count: row.load_count + 1,
    })
    .eq('code', code)
    .then(() => {
      /* non-critical */
    });

  const migratedState = migrateSave(row.state_json);
  return { state: migratedState, schemaVersion: row.schema_version, row };
}

// ---------------------------------------------------------------------------
// deleteSave() — owner-only; call after verifying JWT ownership
// ---------------------------------------------------------------------------
export async function deleteSave(
  client: AnyClient,
  code: string,
  ownerId: string,
): Promise<boolean> {
  const { data, error } = await client
    .from('saves')
    .delete()
    .eq('code', code)
    .eq('owner_id', ownerId)
    .select('code')
    .maybeSingle();

  if (error) throw new Error(`deleteSave failed: ${error.message}`);
  return data !== null;
}
