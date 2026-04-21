import type { UIPhase } from '../game/phase';

interface PhaseTabsProps {
  currentPhase: UIPhase;
  isHumanTurn: boolean;
}

const TABS: { id: UIPhase; label: string }[] = [
  { id: 'Draft', label: '01 DRAFT' },
  { id: 'Deploy', label: '02 DEPLOY' },
  { id: 'Attack', label: '03 ATTACK' },
  { id: 'Fortify', label: '04 FORTIFY' },
  { id: 'End', label: '05 END' },
];

/**
 * Phase tab bar at top-center of stage. Derived from state.phase.
 * Active tab gets a pulsing underline + hot-glow shadow.
 * Tabs not accessible during AI turn appear dimmed.
 */
export function PhaseTabs({ currentPhase, isHumanTurn }: PhaseTabsProps) {
  if (currentPhase === 'Setup' || currentPhase === 'Done') {
    return (
      <div className="absolute left-1/2 top-3 z-10 -translate-x-1/2">
        <span className="border border-line bg-bg-0/80 px-4 py-1 font-mono text-[10px] uppercase tracking-widest text-ink-faint">
          {currentPhase}
        </span>
      </div>
    );
  }

  return (
    <div className="absolute left-1/2 top-3 z-10 flex -translate-x-1/2 items-stretch border border-line bg-bg-0/80">
      {TABS.map(({ id, label }) => {
        const isActive = id === currentPhase;
        const isReachable = isHumanTurn && (id === currentPhase || isUpcoming(currentPhase, id));

        return (
          <div
            key={id}
            className={`relative border-r border-line px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.14em] last:border-r-0 ${
              isActive
                ? 'bg-hot/10 text-hot'
                : isReachable
                  ? 'text-ink-dim opacity-100'
                  : 'text-ink-ghost opacity-40'
            }`}
            style={{
              transition:
                'color var(--dur-fast) var(--ease-out-fast), background-color var(--dur-fast) linear, opacity var(--dur-norm) linear',
              boxShadow: isActive
                ? 'inset 0 -1px 0 0 var(--hot), var(--shadow-hot-glow)'
                : undefined,
            }}
          >
            {label}
            {isActive && (
              <span
                aria-hidden
                className="rr-anim-pulseGlow absolute -bottom-px left-1.5 right-1.5 h-[2px]"
                style={{
                  background: 'var(--hot)',
                  boxShadow: 'var(--shadow-hot-glow)',
                  animation: 'pulseGlow 1500ms ease-in-out infinite',
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

const ORDER: UIPhase[] = ['Draft', 'Deploy', 'Attack', 'Fortify', 'End'];

function isUpcoming(current: UIPhase, tab: UIPhase): boolean {
  const ci = ORDER.indexOf(current);
  const ti = ORDER.indexOf(tab);
  return ti > ci;
}
