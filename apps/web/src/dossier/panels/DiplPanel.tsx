import type { GameState, PlayerState } from '@riskrask/engine';
import { BOARD_TERRITORY_COUNT, CONTINENTS } from '@riskrask/engine';
import { useGame } from '../../game/useGame';

interface DiplPanelProps {
  state: GameState;
  humanPlayerId: string;
}

interface ThreatRow {
  readonly player: PlayerState;
  readonly territories: number;
  readonly terrPct: number; // 0-100 share of the 42-territory board
  readonly armies: number;
  readonly armyPct: number; // 0-100 relative to the strongest seat
  readonly borderContact: number; // # of human territories adjacent to this seat
}

interface CaptureAggregate {
  readonly attackerId: string;
  readonly count: number;
}

interface ContinentPressure {
  readonly key: string;
  readonly continentName: string;
  readonly bonus: number;
  readonly total: number; // # members
  readonly dominantOwnerId: string;
  readonly owned: number; // held by dominantOwnerId
  readonly remaining: number; // total - owned
}

const CAPTURE_RE = /^(.+?) captured from (.+?)\.$/;

/**
 * Diplomacy tab. Read-only intel: threat matrix, derived conflict history,
 * and continent-pressure watch. Classic Risk has no formal diplomacy, so we
 * surface observable tension signals instead.
 */
export function DiplPanel({ state, humanPlayerId }: DiplPanelProps) {
  const log = useGame((s) => s.log);
  const others = state.players.filter((p) => !p.isNeutral && p.id !== humanPlayerId);
  const threatRows = buildThreatRows(state, humanPlayerId);
  const captureRows = buildCaptureRows(state, log);
  const continentRows = buildContinentRows(state, humanPlayerId);
  const nameById = buildNameById(state);

  return (
    <div className="flex flex-col" aria-label="dipl-panel">
      {/* --- Threat matrix --- */}
      <section
        className="flex flex-col gap-2 border-b border-line px-4 py-3"
        aria-label="dipl-threat"
      >
        <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-ink-faint">
          Threat Matrix
        </p>
        {others.length === 0 ? (
          <p className="font-mono text-[10px] text-ink-faint">No rivals.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {threatRows.map((row) => (
              <li
                key={row.player.id}
                className="flex flex-col gap-0.5"
                data-testid={`threat-row-${row.player.id}`}
              >
                <div className="flex items-center justify-between font-mono text-[10px]">
                  <span className="flex items-center gap-1.5">
                    <span
                      aria-hidden
                      className="inline-block h-2 w-2 rounded-sm"
                      style={{ background: row.player.color }}
                    />
                    <span style={{ color: row.player.color }}>{row.player.name}</span>
                  </span>
                  <span className="text-ink-faint">
                    {row.player.eliminated ? 'eliminated' : 'active'}
                  </span>
                </div>
                <Bar
                  label="map"
                  pct={row.terrPct}
                  rhs={`${row.territories}/${BOARD_TERRITORY_COUNT}`}
                  color={row.player.color}
                />
                <Bar
                  label="army"
                  pct={row.armyPct}
                  rhs={`${row.armies}`}
                  color={row.player.color}
                />
                <div className="flex items-center justify-between font-mono text-[9px] text-ink-dim">
                  <span className="text-ink-faint">border</span>
                  <span>
                    {row.borderContact} {row.borderContact === 1 ? 'contact' : 'contacts'}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* --- Conflict history --- */}
      <section
        className="flex flex-col gap-2 border-b border-line px-4 py-3"
        aria-label="dipl-conflict"
      >
        <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-ink-faint">
          Conflict History
        </p>
        {captureRows.length === 0 ? (
          <p className="font-mono text-[10px] text-ink-faint">No captures logged.</p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {captureRows.map((c) => {
              const name = nameById.get(c.attackerId) ?? c.attackerId;
              const color = state.players.find((p) => p.id === c.attackerId)?.color;
              return (
                <li
                  key={c.attackerId}
                  className="flex items-center justify-between font-mono text-[10px]"
                  data-testid={`capture-row-${c.attackerId}`}
                >
                  <span style={color ? { color } : undefined}>{name}</span>
                  <span className="text-ink-dim">
                    {c.count} {c.count === 1 ? 'capture' : 'captures'}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* --- Continent pressure --- */}
      <section
        className="flex flex-col gap-2 border-b border-line px-4 py-3"
        aria-label="dipl-continents"
      >
        <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-ink-faint">
          Continent Pressure
        </p>
        {continentRows.length === 0 ? (
          <p className="font-mono text-[10px] text-ink-faint">No rival pressure.</p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {continentRows.map((c) => {
              const ownerName = nameById.get(c.dominantOwnerId) ?? c.dominantOwnerId;
              const ownerColor = state.players.find((p) => p.id === c.dominantOwnerId)?.color;
              return (
                <li
                  key={c.key}
                  className="flex items-center justify-between font-mono text-[10px]"
                  data-testid={`continent-row-${c.key}`}
                >
                  <span className="text-ink-dim">
                    {c.continentName} <span className="text-ink-faint">(+{c.bonus})</span>
                  </span>
                  <span style={ownerColor ? { color: ownerColor } : undefined}>
                    {ownerName}{' '}
                    <span className="text-ink-faint">
                      {c.owned}/{c.total}
                      {c.remaining > 0 ? ` · ${c.remaining} to bonus` : ' · full'}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

interface BarProps {
  readonly label: string;
  readonly pct: number; // 0-100
  readonly rhs: string;
  readonly color: string;
}

function Bar({ label, pct, rhs, color }: BarProps) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className="flex items-center gap-1.5 font-mono text-[9px] text-ink-dim">
      <span className="w-8 shrink-0 text-ink-faint">{label}</span>
      <span aria-hidden className="relative h-1 flex-1 overflow-hidden rounded-sm bg-line/60">
        <span
          className="absolute left-0 top-0 h-full"
          style={{ width: `${clamped}%`, background: color }}
        />
      </span>
      <span className="w-12 shrink-0 text-right">{rhs}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pure helpers (exported for tests)
// ---------------------------------------------------------------------------

export function buildThreatRows(state: GameState, humanPlayerId: string): ThreatRow[] {
  const others = state.players.filter((p) => !p.isNeutral && p.id !== humanPlayerId);
  // Precompute per-player army totals.
  const armiesBy = new Map<string, number>();
  const terrsBy = new Map<string, number>();
  for (const t of Object.values(state.territories)) {
    if (t.owner == null) continue;
    armiesBy.set(t.owner, (armiesBy.get(t.owner) ?? 0) + t.armies);
    terrsBy.set(t.owner, (terrsBy.get(t.owner) ?? 0) + 1);
  }
  const maxArmies = Math.max(1, ...others.map((p) => armiesBy.get(p.id) ?? 0));
  const humanTerritories = Object.entries(state.territories).filter(
    ([, t]) => t.owner === humanPlayerId,
  );

  return others.map((player) => {
    const territories = terrsBy.get(player.id) ?? 0;
    const armies = armiesBy.get(player.id) ?? 0;
    // Border contact: count of human-owned territories adjacent to any
    // territory owned by `player`. This is directional (human perspective);
    // shared borders are symmetric so the count is identical either way.
    let borderContact = 0;
    for (const [, t] of humanTerritories) {
      for (const adj of t.adj) {
        if (state.territories[adj]?.owner === player.id) {
          borderContact++;
          break;
        }
      }
    }
    return {
      player,
      territories,
      terrPct: (territories / BOARD_TERRITORY_COUNT) * 100,
      armies,
      armyPct: (armies / maxArmies) * 100,
      borderContact,
    };
  });
}

/**
 * Parse capture log entries into attacker-aggregated counts.
 *
 * The log text format is `"<to> captured from <from>."` where both tokens are
 * *territory names* (see `appendLog` in useGame.ts). We infer the attacker by
 * looking up the current owner of the captured territory. That's exact at
 * capture time and remains correct unless the territory has since changed
 * hands; if the territory has no current owner we drop the event from the
 * tally rather than misattribute.
 */
export function buildCaptureRows(
  state: GameState,
  log: readonly { readonly turn: number; readonly text: string }[],
): CaptureAggregate[] {
  const counts = new Map<string, number>();
  for (const line of log) {
    const m = CAPTURE_RE.exec(line.text);
    if (!m) continue;
    const toTerritory = m[1];
    if (!toTerritory) continue;
    const owner = state.territories[toTerritory]?.owner;
    if (!owner) continue;
    counts.set(owner, (counts.get(owner) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([attackerId, count]) => ({ attackerId, count }))
    .sort((a, b) => b.count - a.count);
}

export function buildContinentRows(state: GameState, humanPlayerId: string): ContinentPressure[] {
  const rows: ContinentPressure[] = [];
  for (const [key, def] of Object.entries(CONTINENTS)) {
    // Count holdings per non-human, non-neutral owner.
    const holdings = new Map<string, number>();
    let humanHeld = 0;
    for (const name of def.members) {
      const owner = state.territories[name]?.owner;
      if (!owner) continue;
      if (owner === humanPlayerId) {
        humanHeld++;
        continue;
      }
      const playerMeta = state.players.find((p) => p.id === owner);
      if (playerMeta?.isNeutral) continue;
      holdings.set(owner, (holdings.get(owner) ?? 0) + 1);
    }
    // Skip continents the human fully controls or where no rival holds ground.
    if (humanHeld === def.members.length) continue;
    if (holdings.size === 0) continue;
    // Pick dominant rival. Ties broken by first-seen order.
    let dominantOwnerId = '';
    let owned = 0;
    for (const [id, n] of holdings) {
      if (n > owned) {
        dominantOwnerId = id;
        owned = n;
      }
    }
    rows.push({
      key,
      continentName: def.name,
      bonus: def.bonus,
      total: def.members.length,
      dominantOwnerId,
      owned,
      remaining: def.members.length - owned,
    });
  }
  // Sort by how close the dominant rival is to the bonus (fewer remaining = hotter).
  rows.sort((a, b) => a.remaining - b.remaining);
  return rows;
}

function buildNameById(state: GameState): Map<string, string> {
  const m = new Map<string, string>();
  for (const p of state.players) m.set(p.id, p.name);
  return m;
}
