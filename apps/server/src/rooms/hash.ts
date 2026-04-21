/**
 * Stable state hash for desync detection.
 *
 * The engine already ships a canonical-JSON FNV-ish hash (`hashState`).
 * Re-export it here so server modules import a single symbol regardless
 * of whether the engine one stays in-tree long-term.
 */

import { hashState } from '@riskrask/engine';

export function hashGameState(state: unknown): string {
  return hashState(state);
}
