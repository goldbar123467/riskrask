import { BOARD_TERRITORY_COUNT, CONTINENTS } from '@riskrask/engine';
import type { GameState, PlayerState } from '@riskrask/engine';

interface ArmyPanelProps {
  state: GameState;
  humanPlayerId: string;
}

interface ContinentRow {
  key: string;
  name: string;
  owned: number;
  total: number;
  held: boolean;
}

interface RosterEntry {
  player: PlayerState;
  territories: number;
  armies: number;
  continents: ContinentRow[];
}

/** Human-readable phase label matching the Dossier aesthetic. */
const PHASE_LABEL: Readonly<Record<GameState['phase'], string>> = {
  'setup-claim': 'Setup · Claim',
  'setup-reinforce': 'Setup · Reinforce',
  reinforce: 'Reinforce',
  attack: 'Attack',
  fortify: 'Fortify',
  done: 'Done',
};

/**
 * Precomputes per-player territory counts, army totals, and per-continent
 * ownership in a single pass over `state.territories`. Avoids the O(T·P)
 * shape that the naive "filter once per player" approach falls into.
 */
function buildRoster(state: GameState): RosterEntry[] {
  const continentKeys = Object.keys(CONTINENTS);

  const terrByPlayer = new Map<string, number>();
  const armyByPlayer = new Map<string, number>();
  // continentOwned[playerId][continentKey] -> count
  const continentOwned = new Map<string, Map<string, number>>();

  for (const p of state.players) {
    if (p.isNeutral) continue;
    terrByPlayer.set(p.id, 0);
    armyByPlayer.set(p.id, 0);
    const cmap = new Map<string, number>();
    for (const ck of continentKeys) cmap.set(ck, 0);
    continentOwned.set(p.id, cmap);
  }

  for (const terr of Object.values(state.territories)) {
    if (terr.owner === null) continue;
    if (!terrByPlayer.has(terr.owner)) continue; // owner is Neutral / unknown
    terrByPlayer.set(terr.owner, (terrByPlayer.get(terr.owner) ?? 0) + 1);
    armyByPlayer.set(terr.owner, (armyByPlayer.get(terr.owner) ?? 0) + terr.armies);
    const cmap = continentOwned.get(terr.owner);
    if (cmap) {
      cmap.set(terr.continent, (cmap.get(terr.continent) ?? 0) + 1);
    }
  }

  const roster: RosterEntry[] = [];
  for (const p of state.players) {
    if (p.isNeutral) continue;
    const cmap = continentOwned.get(p.id) ?? new Map<string, number>();
    const continents: ContinentRow[] = [];
    for (const ck of continentKeys) {
      const owned = cmap.get(ck) ?? 0;
      if (owned === 0) continue;
      const def = CONTINENTS[ck];
      if (!def) continue;
      continents.push({
        key: ck,
        name: def.name,
        owned,
        total: def.members.length,
        held: owned === def.members.length,
      });
    }
    roster.push({
      player: p,
      territories: terrByPlayer.get(p.id) ?? 0,
      armies: armyByPlayer.get(p.id) ?? 0,
      continents,
    });
  }
  return roster;
}

/**
 * Army tab. Global overview header followed by a per-seat roster card.
 * Non-Neutral players only. Current player floats to the top; the rest
 * sort by territory count descending.
 */
export function ArmyPanel({ state, humanPlayerId }: ArmyPanelProps) {
  const currentPlayerId = state.players[state.currentPlayerIdx]?.id ?? null;

  const roster = buildRoster(state);
  roster.sort((a, b) => {
    if (a.player.id === currentPlayerId && b.player.id !== currentPlayerId) return -1;
    if (b.player.id === currentPlayerId && a.player.id !== currentPlayerId) return 1;
    return b.territories - a.territories;
  });

  const totalClaimed = Object.values(state.territories).reduce(
    (n, t) => n + (t.owner !== null ? 1 : 0),
    0,
  );

  return (
    <div className="flex flex-col" aria-label="army-panel">
      <header
        className="flex flex-col gap-1 border-b border-line px-4 py-3"
        aria-label="army-overview"
      >
        <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-ink-faint">
          Global Overview
        </p>
        <div className="flex items-center justify-between font-mono text-[10px] text-ink-dim">
          <span>
            <span className="text-ink-faint">Terr</span>{' '}
            <span className="text-ink">
              {totalClaimed} / {BOARD_TERRITORY_COUNT}
            </span>
          </span>
          <span>
            <span className="text-ink-faint">Turn</span>{' '}
            <span className="text-ink">{state.turn + 1}</span>
          </span>
          <span>
            <span className="text-ink-faint">Phase</span>{' '}
            <span className="text-ink">{PHASE_LABEL[state.phase]}</span>
          </span>
        </div>
      </header>

      <ul className="flex flex-col" aria-label="army-roster">
        {roster.map((row) => (
          <RosterCard
            key={row.player.id}
            row={row}
            isHuman={row.player.id === humanPlayerId}
            isCurrent={row.player.id === currentPlayerId}
          />
        ))}
        {roster.length === 0 && (
          <li className="border-b border-line px-4 py-3 font-mono text-[10px] text-ink-faint">
            No combatants.
          </li>
        )}
      </ul>
    </div>
  );
}

interface RosterCardProps {
  row: RosterEntry;
  isHuman: boolean;
  isCurrent: boolean;
}

function RosterCard({ row, isHuman, isCurrent }: RosterCardProps) {
  const { player, territories, armies, continents } = row;
  const tag = isHuman ? 'YOU' : player.isAI ? 'AI' : '';
  const cardCount = player.cards.length;

  return (
    <li
      className={`flex flex-col gap-2 border-b border-line px-4 py-3 ${
        player.eliminated ? 'opacity-40' : ''
      }`}
      style={
        isCurrent
          ? { borderLeft: `2px solid ${player.color}`, background: `${player.color}0d` }
          : undefined
      }
      data-player-id={player.id}
      data-current={isCurrent ? 'true' : 'false'}
      data-eliminated={player.eliminated ? 'true' : 'false'}
      aria-label={`army-row-${player.id}`}
    >
      {/* Header: chip + name + tag + status */}
      <div className="flex items-center gap-2">
        <div className="h-2.5 w-2.5 shrink-0 rotate-45" style={{ background: player.color }} />
        <span className="flex-1 truncate font-display text-[12px] text-ink">{player.name}</span>
        {tag && (
          <span className="font-mono text-[9px] uppercase tracking-[0.22em] text-ink-faint">
            {tag}
          </span>
        )}
        {player.eliminated ? (
          <span className="font-mono text-[9px] uppercase tracking-[0.22em] text-danger line-through">
            eliminated
          </span>
        ) : (
          <span className="font-mono text-[9px] uppercase tracking-[0.22em] text-ok">active</span>
        )}
      </div>

      {/* Stat strip */}
      <div className="grid grid-cols-4 gap-2">
        <Stat label="Terr" value={territories} />
        <Stat label="Armies" value={armies} />
        <Stat label="Reserves" value={player.reserves} />
        <Stat label="Cards" value={isHuman ? cardCount : '?'} />
      </div>

      {/* Continent breakdown */}
      {continents.length > 0 && (
        <ul className="flex flex-col gap-0.5" aria-label={`continents-${player.id}`}>
          {continents.map((c) => (
            <li
              key={c.key}
              className="flex items-center justify-between font-mono text-[9px]"
              data-continent={c.key}
              data-held={c.held ? 'true' : 'false'}
            >
              <span className="uppercase tracking-[0.16em] text-ink-faint">{c.name}</span>
              <span className="flex items-center gap-1">
                <span className={c.held ? 'text-ok' : 'text-ink-dim'}>
                  {c.owned}/{c.total}
                </span>
                {c.held && (
                  <span className="text-ok" aria-label="continent-held" title="Continent held">
                    ★
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex flex-col">
      <span className="font-mono text-[8px] uppercase tracking-[0.22em] text-ink-faint">
        {label}
      </span>
      <span className="font-mono text-[11px] text-ink">{value}</span>
    </div>
  );
}
