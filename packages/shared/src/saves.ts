import { z } from 'zod';
import { CURRENT_SCHEMA_VERSION } from './index';

// =============================================================
// Wire schema for a persisted GameState blob
// Kept loose with passthrough() so the engine (parallel port)
// can add typed fields without a migration every time.
// =============================================================
export const GameStateSchema = z
  .object({
    schemaVersion: z.number().int().min(1),
  })
  .passthrough();

export type GameStateBlob = z.infer<typeof GameStateSchema>;

// =============================================================
// Migration registry
// Each entry describes a single version bump.
// Add a new entry every time CURRENT_SCHEMA_VERSION increases.
// CI enforces that max(migration.to) === CURRENT_SCHEMA_VERSION.
// =============================================================
export type Migration = {
  from: number;
  to: number;
  run: (s: Record<string, unknown>) => Record<string, unknown>;
};

export const MIGRATIONS: Migration[] = [
  // Example (uncomment + adjust when v2 lands):
  // { from: 1, to: 2, run: (s) => ({ ...s, repMatrix: {} }) },
];

// =============================================================
// migrateSave()
// Walks MIGRATIONS until schemaVersion reaches CURRENT_SCHEMA_VERSION.
// Throws on missing migration or unexpected final version.
// =============================================================
export function migrateSave(raw: unknown): GameStateBlob {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let s = GameStateSchema.parse(raw) as Record<string, unknown>;

  while ((s.schemaVersion as number) < CURRENT_SCHEMA_VERSION) {
    const current = s.schemaVersion as number;
    const m = MIGRATIONS.find((m) => m.from === current);
    if (!m) {
      throw new Error(`no migration from schemaVersion ${current}`);
    }
    s = m.run(s);
    s.schemaVersion = m.to;
  }

  if ((s.schemaVersion as number) !== CURRENT_SCHEMA_VERSION) {
    throw new Error(
      `migration ended at schemaVersion ${s.schemaVersion as number}, expected ${CURRENT_SCHEMA_VERSION}`,
    );
  }

  return s as GameStateBlob;
}

// =============================================================
// CI guard: max migration target must equal CURRENT_SCHEMA_VERSION
// Import this in test suites; it throws at import time if violated.
// =============================================================
export function assertMigrationRegistryIsComplete(): void {
  if (MIGRATIONS.length === 0) {
    // At v1 there are no migrations yet — that is correct.
    if (CURRENT_SCHEMA_VERSION !== 1) {
      throw new Error(
        `MIGRATIONS registry is empty but CURRENT_SCHEMA_VERSION is ${CURRENT_SCHEMA_VERSION}. Add a migration entry for every version bump.`,
      );
    }
    return;
  }

  const maxTo = Math.max(...MIGRATIONS.map((m) => m.to));
  if (maxTo !== CURRENT_SCHEMA_VERSION) {
    throw new Error(
      `MIGRATIONS max target is ${maxTo} but CURRENT_SCHEMA_VERSION is ${CURRENT_SCHEMA_VERSION}. Add a migration entry or revert the version bump.`,
    );
  }
}
