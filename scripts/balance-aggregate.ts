/**
 * Balance aggregator — reads a JSONL produced by `balance-harness.ts` and
 * writes a human-readable markdown report to
 *   docs/balance/balance-<YYYY-MM-DD>.md
 *
 * Sections:
 *   - Overall summary (victories, timeouts, avg length, wall clock)
 *   - Per-archetype headline table: win-rate + "effective" rate (leader-on-
 *     timeout acts as a weak win signal; raw rate is the strict success rate)
 *   - Per-player-count breakdown (3p / 4p / 5p / 6p)
 *   - Archetype-vs-archetype matchup matrix (A beats B when both present)
 *   - Game-length distribution buckets
 *   - Per-continent flip rate (avg flips per game)
 *   - Outlier highlights (the tweaking targets)
 *
 * Usage:
 *   bun run scripts/balance-aggregate.ts                   # latest JSONL
 *   bun run scripts/balance-aggregate.ts reports/foo.jsonl # explicit
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { Arch, type ArchId } from '@riskrask/ai';
import { CONTINENTS } from '@riskrask/engine';

interface GameRecord {
  schemaVersion: 1;
  seed: string;
  playerCount: number;
  players: { id: string; archId: ArchId }[];
  outcome: 'victory' | 'timeout' | 'error';
  winnerArchId: ArchId | null;
  winnerId: string | null;
  leaderArchId: ArchId | null;
  leaderId: string | null;
  leaderTerritories: number;
  turnsPlayed: number;
  actionsApplied: number;
  continentFlips: Record<string, number>;
  finalHash: string;
  errorMessage?: string;
  wallMs: number;
}

const REPO_ROOT = resolve(new URL(import.meta.url).pathname, '../..');

function latestReport(): string {
  const dir = join(REPO_ROOT, 'reports');
  if (!existsSync(dir)) throw new Error(`no reports/ dir at ${dir}`);
  const files = readdirSync(dir)
    .filter((f) => f.startsWith('balance-') && f.endsWith('.jsonl'))
    .sort();
  const last = files[files.length - 1];
  if (!last) throw new Error(`no balance-*.jsonl files in ${dir}`);
  return join(dir, last);
}

function readJsonl(path: string): GameRecord[] {
  const raw = readFileSync(path, 'utf8');
  return raw
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as GameRecord);
}

function pct(num: number, denom: number): string {
  if (denom === 0) return '—';
  return `${((100 * num) / denom).toFixed(1)}%`;
}

function fixed(n: number, digits = 1): string {
  return n.toFixed(digits);
}

interface ArchStats {
  games: number;
  wins: number;
  leaderTimeouts: number; // leader of a stalemated game
  totalTurnsInWonGames: number;
  archId: ArchId;
}

interface MatchupCell {
  coAppearances: number;
  aWins: number; // games where A won
  aLeadsB: number; // games where A has more territories than B at end (including wins)
}

function fmtArch(archId: ArchId): string {
  const def = Arch.get(archId);
  return def ? `**${archId}** · _${def.name}_` : archId;
}

function renderArchRow(s: ArchStats): string {
  const winRate = pct(s.wins, s.games);
  const effRate = pct(s.wins + s.leaderTimeouts, s.games);
  const avgWinLen =
    s.wins > 0 ? fixed(s.totalTurnsInWonGames / s.wins) : '—';
  return `| ${s.archId} | ${s.games} | ${s.wins} | ${winRate} | ${effRate} | ${avgWinLen} |`;
}

export function buildMarkdown(records: GameRecord[]): string {
  const total = records.length;
  const victories = records.filter((r) => r.outcome === 'victory').length;
  const timeouts = records.filter((r) => r.outcome === 'timeout').length;
  const errors = records.filter((r) => r.outcome === 'error').length;
  const avgTurns = records.reduce((s, r) => s + r.turnsPlayed, 0) / Math.max(1, total);
  const avgActions = records.reduce((s, r) => s + r.actionsApplied, 0) / Math.max(1, total);
  const totalWallMs = records.reduce((s, r) => s + r.wallMs, 0);

  // Per-arch stats
  const statsByArch: Map<ArchId, ArchStats> = new Map();
  for (const arch of Arch.ids) {
    statsByArch.set(arch, {
      archId: arch,
      games: 0,
      wins: 0,
      leaderTimeouts: 0,
      totalTurnsInWonGames: 0,
    });
  }
  for (const r of records) {
    for (const p of r.players) {
      const s = statsByArch.get(p.archId);
      if (!s) continue;
      s.games++;
      if (r.outcome === 'victory' && r.winnerArchId === p.archId) {
        s.wins++;
        s.totalTurnsInWonGames += r.turnsPlayed;
      } else if (r.outcome === 'timeout' && r.leaderArchId === p.archId) {
        s.leaderTimeouts++;
      }
    }
  }

  // Per player count × arch
  const byPcArch: Map<number, Map<ArchId, ArchStats>> = new Map();
  for (const pc of [3, 4, 5, 6]) {
    const m = new Map<ArchId, ArchStats>();
    for (const arch of Arch.ids) {
      m.set(arch, {
        archId: arch,
        games: 0,
        wins: 0,
        leaderTimeouts: 0,
        totalTurnsInWonGames: 0,
      });
    }
    byPcArch.set(pc, m);
  }
  for (const r of records) {
    const m = byPcArch.get(r.playerCount);
    if (!m) continue;
    for (const p of r.players) {
      const s = m.get(p.archId);
      if (!s) continue;
      s.games++;
      if (r.outcome === 'victory' && r.winnerArchId === p.archId) {
        s.wins++;
        s.totalTurnsInWonGames += r.turnsPlayed;
      } else if (r.outcome === 'timeout' && r.leaderArchId === p.archId) {
        s.leaderTimeouts++;
      }
    }
  }

  // Matchup matrix: A-vs-B coAppearances / aWins
  const matchup: Map<string, MatchupCell> = new Map();
  for (const r of records) {
    for (const a of r.players) {
      for (const b of r.players) {
        if (a.archId === b.archId) continue;
        const key = `${a.archId}|${b.archId}`;
        const cell = matchup.get(key) ?? { coAppearances: 0, aWins: 0, aLeadsB: 0 };
        cell.coAppearances++;
        if (r.outcome === 'victory' && r.winnerArchId === a.archId) cell.aWins++;
        // "A leads B": A finished with more territories, approximated by comparing
        // leaderArchId-vs-b if a is the leader.
        if (r.leaderArchId === a.archId && r.leaderArchId !== b.archId) cell.aLeadsB++;
        matchup.set(key, cell);
      }
    }
  }

  // Game length buckets
  const lengthBuckets: Record<string, number> = { '0-50': 0, '51-100': 0, '101-150': 0, '151-200': 0, '201+': 0 };
  for (const r of records) {
    const t = r.turnsPlayed;
    if (t <= 50) lengthBuckets['0-50']!++;
    else if (t <= 100) lengthBuckets['51-100']!++;
    else if (t <= 150) lengthBuckets['101-150']!++;
    else if (t <= 200) lengthBuckets['151-200']!++;
    else lengthBuckets['201+']!++;
  }

  // Continent flip averages
  const continentAvgFlips: Record<string, number> = {};
  for (const key of Object.keys(CONTINENTS)) {
    const sum = records.reduce((s, r) => s + (r.continentFlips[key] ?? 0), 0);
    continentAvgFlips[key] = sum / Math.max(1, total);
  }

  // ---------------------------------------------------------------------------
  // Render markdown
  // ---------------------------------------------------------------------------
  const lines: string[] = [];
  const now = new Date().toISOString();

  lines.push('# Balance Report');
  lines.push('');
  lines.push(`_Generated ${now}. ${total} games._`);
  lines.push('');

  lines.push('## Overall');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|---|---|');
  lines.push(`| Total games | ${total} |`);
  lines.push(`| Victories (world domination) | ${victories} (${pct(victories, total)}) |`);
  lines.push(`| Timeouts (stalemates) | ${timeouts} (${pct(timeouts, total)}) |`);
  lines.push(`| Errors | ${errors} |`);
  lines.push(`| Avg turns played | ${fixed(avgTurns)} |`);
  lines.push(`| Avg actions / game | ${fixed(avgActions, 0)} |`);
  lines.push(`| Total wall time | ${fixed(totalWallMs / 1000, 1)}s |`);
  lines.push('');

  lines.push('## Per-archetype (all player counts)');
  lines.push('');
  lines.push(
    '| Archetype | Games | Wins | Win rate | Effective rate<sup>†</sup> | Avg turns in won games |',
  );
  lines.push('|---|---|---|---|---|---|');
  const sortedStats = [...statsByArch.values()].sort((a, b) => b.wins / Math.max(1, b.games) - a.wins / Math.max(1, a.games));
  for (const s of sortedStats) lines.push(renderArchRow(s));
  lines.push('');
  lines.push('<sup>†</sup> Effective rate counts (victory) + (leader-at-timeout); stalemates typically dominate, so this is a weak proxy when victory rates are very low.');
  lines.push('');

  for (const pc of [3, 4, 5, 6]) {
    const m = byPcArch.get(pc);
    if (!m) continue;
    lines.push(`## ${pc}-player games`);
    lines.push('');
    lines.push('| Archetype | Games | Wins | Win rate | Effective rate |');
    lines.push('|---|---|---|---|---|');
    const sorted = [...m.values()].sort(
      (a, b) => b.wins / Math.max(1, b.games) - a.wins / Math.max(1, a.games),
    );
    for (const s of sorted) {
      const eff = pct(s.wins + s.leaderTimeouts, s.games);
      lines.push(`| ${s.archId} | ${s.games} | ${s.wins} | ${pct(s.wins, s.games)} | ${eff} |`);
    }
    lines.push('');
  }

  lines.push('## Archetype-vs-archetype matchups');
  lines.push('');
  lines.push(
    '_Row A, Column B: when both appear in a game, how often does A win (`—` if < 5 co-appearances)._',
  );
  lines.push('');
  const header = ['archetype', ...Arch.ids];
  lines.push(`| ${header.join(' | ')} |`);
  lines.push(`| ${header.map(() => '---').join(' | ')} |`);
  for (const a of Arch.ids) {
    const row: string[] = [a];
    for (const b of Arch.ids) {
      if (a === b) {
        row.push('·');
        continue;
      }
      const cell = matchup.get(`${a}|${b}`);
      if (!cell || cell.coAppearances < 5) {
        row.push('—');
        continue;
      }
      row.push(pct(cell.aWins, cell.coAppearances));
    }
    lines.push(`| ${row.join(' | ')} |`);
  }
  lines.push('');

  lines.push('## Game length distribution');
  lines.push('');
  lines.push('| Bucket (turns) | Games | % |');
  lines.push('|---|---|---|');
  for (const [bucket, n] of Object.entries(lengthBuckets)) {
    lines.push(`| ${bucket} | ${n} | ${pct(n, total)} |`);
  }
  lines.push('');

  lines.push('## Continent flips (avg per game)');
  lines.push('');
  lines.push('| Continent | Avg flips | Members |');
  lines.push('|---|---|---|');
  for (const key of Object.keys(CONTINENTS)) {
    const c = CONTINENTS[key];
    if (!c) continue;
    lines.push(
      `| ${key} (${c.name}) | ${fixed(continentAvgFlips[key] ?? 0, 2)} | ${c.members.length} |`,
    );
  }
  lines.push('');

  // ---------------------------------------------------------------------------
  // Outliers (flagged by the standing rules from the brief)
  // ---------------------------------------------------------------------------
  lines.push('## Outliers flagged');
  lines.push('');
  const outliers: string[] = [];

  // Rule 1: any archetype with win-rate > 40% in 4-player games
  const fourPlayerMap = byPcArch.get(4);
  if (fourPlayerMap) {
    for (const s of fourPlayerMap.values()) {
      if (s.games >= 10 && s.wins / s.games > 0.4) {
        outliers.push(
          `- **Dominant in 4p**: \`${s.archId}\` wins ${pct(s.wins, s.games)} of its ${s.games} 4-player games (>40% threshold).`,
        );
      }
    }
  }

  // Rule 2: median game length > 200 turns (i.e. most games stalemate)
  if (lengthBuckets['201+']! / Math.max(1, total) > 0.5) {
    outliers.push(
      `- **Games stall**: ${pct(lengthBuckets['201+']!, total)} of games run past 200 turns (threshold >50%). Indicates AI is too passive / defensive.`,
    );
  }

  // Rule 3: a continent that flips > 10 times per game on average
  for (const [key, avg] of Object.entries(continentAvgFlips)) {
    if (avg > 10) {
      outliers.push(
        `- **Hot continent**: \`${key}\` (${CONTINENTS[key]?.name}) flips ${fixed(avg, 1)}× per game on average.`,
      );
    }
  }

  // Rule 4: an archetype that effectively never wins (<2% win rate with ≥30 games)
  for (const s of statsByArch.values()) {
    if (s.games >= 30 && s.wins / s.games < 0.02) {
      outliers.push(
        `- **Underperformer**: \`${s.archId}\` wins ${pct(s.wins, s.games)} of its ${s.games} games (<2% threshold).`,
      );
    }
  }

  if (outliers.length === 0) lines.push('_No outliers flagged._');
  else lines.push(...outliers);
  lines.push('');

  return lines.join('\n');
}

function writeReport(records: GameRecord[], outPath: string): void {
  const md = buildMarkdown(records);
  if (!existsSync(dirname(outPath))) mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, md);
}

function isMain(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return resolve(entry) === resolve(new URL(import.meta.url).pathname);
}

if (isMain()) {
  const input = process.argv[2] ?? latestReport();
  const records = readJsonl(input);
  const stamp = (input.match(/balance-(\d{4}-\d{2}-\d{2})\.jsonl$/)?.[1] ??
    new Date().toISOString().slice(0, 10)) as string;
  const out = process.env.BALANCE_MD_OUT ?? join(REPO_ROOT, 'docs', 'balance', `balance-${stamp}.md`);
  writeReport(records, out);
  console.log(`wrote ${out} (from ${input})`);
}
