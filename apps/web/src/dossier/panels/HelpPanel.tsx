/**
 * Help tab (rail icon "help"). Condensed, always-visible rules reference
 * plus keyboard shortcuts. The canonical source is riskrules.md at the
 * repo root; this panel mirrors a minimal subset inline so players never
 * have to leave the game.
 *
 * Sections are collapsible via native <details>/<summary>. Default state:
 * phase-quick-ref open, all other sections collapsed, so the panel never
 * overflows the dossier column.
 */

// Resolve the app version at build-time with a safe fallback for dev.
// Explicit cast because vitest's env typing omits user-defined keys.
const APP_VERSION =
  (import.meta.env as Record<string, string | undefined>).VITE_APP_VERSION ?? 'dev';

interface PhaseRow {
  phase: string;
  doing: string;
  ends: string;
}

const PHASE_ROWS: PhaseRow[] = [
  { phase: 'Reinforce', doing: 'Trade cards, place armies', ends: 'Auto when reserves hit 0' },
  { phase: 'Attack', doing: 'Roll on adjacent territories', ends: 'End Attack button' },
  { phase: 'Fortify', doing: 'One move of any size', ends: 'End Turn button' },
];

interface DiceRow {
  atk: number;
  def: number | null;
  atkNote?: string;
  defNote?: string;
}

// Sample resolution: attacker rolls 6/5/2, defender rolls 6/4.
// Highest pair 6 vs 6 -> ties go to defender. Second pair 5 vs 4 -> attacker.
// Third attacker die unused (only 2 defender dice).
const SAMPLE_DICE: DiceRow[] = [
  { atk: 6, def: 6, atkNote: 'tie -> def' },
  { atk: 5, def: 4, atkNote: 'atk wins' },
  { atk: 2, def: null, atkNote: 'unused' },
];

function SectionHeader({ label }: { label: string }) {
  return (
    <summary className="cursor-pointer select-none font-mono text-[9px] uppercase tracking-[0.22em] text-ink-faint outline-none hover:text-ink-dim">
      {label}
    </summary>
  );
}

export function HelpPanel() {
  return (
    <div className="flex flex-col gap-2 border-b border-line px-4 py-3" aria-label="help-panel">
      <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-ink-faint">Help</p>

      <details open className="flex flex-col gap-1" data-testid="help-section-phases">
        <SectionHeader label="Phase quick-ref" />
        <table className="mt-1 w-full border-collapse font-mono text-[10px] text-ink-dim">
          <thead>
            <tr className="text-left text-ink-faint">
              <th className="border-b border-line py-0.5 pr-2 font-normal">Phase</th>
              <th className="border-b border-line py-0.5 pr-2 font-normal">You do</th>
              <th className="border-b border-line py-0.5 font-normal">How to end</th>
            </tr>
          </thead>
          <tbody>
            {PHASE_ROWS.map((row) => (
              <tr key={row.phase}>
                <td className="py-0.5 pr-2 align-top text-ink">{row.phase}</td>
                <td className="py-0.5 pr-2 align-top">{row.doing}</td>
                <td className="py-0.5 align-top">{row.ends}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>

      <details className="flex flex-col gap-1" data-testid="help-section-dice">
        <SectionHeader label="Dice math" />
        <p className="mt-1 font-mono text-[10px] text-ink-dim">
          Attacker rolls min(3, armies-1), defender rolls min(2, armies). Highest pair compared,
          then second pair. Ties go to defender.
        </p>
        <div
          className="mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5 font-mono text-[10px]"
          aria-label="dice-example"
        >
          <span className="text-ink-faint">Attacker</span>
          <span className="text-ink-faint">Defender</span>
          {SAMPLE_DICE.map((row) => (
            <div key={`${row.atk}-${row.def ?? 'x'}`} className="contents">
              <span className="text-ink-dim">
                <span className="text-ink">{row.atk}</span>
                {row.atkNote ? <span className="ml-1 text-ink-faint">({row.atkNote})</span> : null}
              </span>
              <span className="text-ink-dim">
                {row.def !== null ? <span className="text-ink">{row.def}</span> : '-'}
                {row.defNote && row.def !== null ? (
                  <span className="ml-1 text-ink-faint">({row.defNote})</span>
                ) : null}
              </span>
            </div>
          ))}
        </div>
      </details>

      <details className="flex flex-col gap-1" data-testid="help-section-cards">
        <SectionHeader label="Card trades" />
        <p className="mt-1 font-mono text-[10px] text-ink-dim">
          3 of a kind, 1 of each, or 2 + wild. Escalating: 4 / 6 / 8 / 10 / 12 / 15, then +5 per
          set. Territory match = +2 on that territory.
        </p>
      </details>

      <details className="flex flex-col gap-1" data-testid="help-section-keys">
        <SectionHeader label="Keyboard shortcuts" />
        <ul className="mt-1 flex flex-col gap-0.5 font-mono text-[10px] text-ink-dim">
          <li>
            <kbd className="text-ink">Space</kbd> &mdash; confirm
          </li>
          <li>
            <kbd className="text-ink">Esc</kbd> &mdash; clear selection
          </li>
          <li>
            <kbd className="text-ink">?</kbd> &mdash; open help
            <span className="ml-1 text-ink-faint">(not wired)</span>
          </li>
        </ul>
      </details>

      <p
        className="mt-1 font-mono text-[9px] uppercase tracking-[0.22em] text-ink-faint"
        data-testid="help-version"
      >
        v{APP_VERSION}
      </p>
    </div>
  );
}
