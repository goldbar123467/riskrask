/**
 * Stats accumulator — replaces v2 `Persist` (localStorage-based).
 * Pure helpers for `profiles.arch_stats` JSONB. No I/O.
 */

export interface ArchStats {
  wins: number;
  losses: number;
  games: number;
}

/** All arch stats for one player, keyed by archId. */
export type ArchStatsBlob = Record<string, ArchStats>;

export interface PlayerOutcome {
  readonly archId: string | null;
  readonly won: boolean;
}

export function emptyStats(): ArchStatsBlob {
  return {};
}

/** Returns a new stats blob with the game recorded. Pure. */
export function recordGame(
  stats: ArchStatsBlob,
  outcomes: readonly PlayerOutcome[],
): ArchStatsBlob {
  const next: ArchStatsBlob = JSON.parse(JSON.stringify(stats)) as ArchStatsBlob;
  for (const outcome of outcomes) {
    if (!outcome.archId) continue;
    const s = next[outcome.archId] ?? { wins: 0, losses: 0, games: 0 };
    s.games++;
    if (outcome.won) s.wins++;
    else s.losses++;
    next[outcome.archId] = s;
  }
  return next;
}

export function leaderboard(
  stats: ArchStatsBlob,
): Array<ArchStats & { id: string; winRate: number }> {
  return Object.entries(stats)
    .map(([id, s]) => ({ id, ...s, winRate: s.games > 0 ? s.wins / s.games : 0 }))
    .sort((a, b) => b.winRate - a.winRate);
}
