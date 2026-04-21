import { PALETTE, createInitialState } from '@riskrask/engine';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGame } from '../game/useGame';

interface SeatConfig {
  name: string;
  isAI: boolean;
}

const DEFAULT_AI_NAME = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo'];

function randomSeed(): string {
  return Math.random().toString(36).substring(2, 10);
}

/**
 * Setup wizard: player count + faction, per-seat AI/human, seed.
 * On "Launch" calls createInitialState and navigates to /play.
 *
 * No multiplayer hooks — Track F wires those in later.
 */
export function Setup() {
  const navigate = useNavigate();
  const loadState = useGame((s) => s.loadState);

  const [playerCount, setPlayerCount] = useState(3);
  // In the classic Neutral variant the engine synthesises a 3rd "Neutral"
  // participant; the UI still only collects 1 opponent for a 2-player game.
  const [hostName, setHostName] = useState('Commander');
  const [hostColorIdx, setHostColorIdx] = useState(0);
  const [seed, setSeed] = useState(randomSeed);
  const [seats, setSeats] = useState<SeatConfig[]>(
    Array.from({ length: 5 }, (_, i) => ({
      name: DEFAULT_AI_NAME[i] ?? `AI-${i + 2}`,
      isAI: true,
    })),
  );

  const otherSeats = seats.slice(0, playerCount - 1);

  function updateSeat(i: number, patch: Partial<SeatConfig>) {
    setSeats((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }

  function handleLaunch() {
    const players = [
      {
        id: 'human',
        name: hostName,
        color: PALETTE[hostColorIdx]?.color ?? PALETTE[0]!.color,
        isAI: false,
      },
      ...otherSeats.map((s, i) => ({
        id: `ai-${i + 1}`,
        name: s.name,
        color: PALETTE[(hostColorIdx + i + 1) % PALETTE.length]?.color ?? PALETTE[0]!.color,
        isAI: s.isAI,
      })),
    ];

    const initialState = createInitialState({ seed, players });
    loadState(initialState);
    void navigate('/play');
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-bg-0 px-8 py-12">
      {/* Header */}
      <div className="flex flex-col items-center gap-2">
        <div className="relative h-7 w-7">
          <div className="absolute inset-0 rotate-45 border border-ink" />
          <div className="absolute h-[6px] w-[6px] bg-hot" style={{ top: 11, left: 11 }} />
        </div>
        <h1 className="font-display text-sm tracking-[0.36em] text-ink">RISKRASK · SETUP</h1>
      </div>

      <div className="w-full max-w-md space-y-6">
        {/* Player count */}
        <Section title="Players">
          {playerCount === 2 && (
            <p className="font-mono text-[10px] uppercase tracking-widest text-ink-ghost">
              2P · Neutral variant (beta) — a third Neutral army is added automatically.
            </p>
          )}
          <div className="flex gap-2">
            {[2, 3, 4, 5, 6].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setPlayerCount(n)}
                className={`flex-1 border py-2 font-mono text-sm transition-colors ${
                  playerCount === n
                    ? 'border-hot bg-hot/10 text-hot'
                    : 'border-line text-ink-faint hover:border-line-2 hover:text-ink-dim'
                }`}
                title={n === 2 ? 'Two-player Neutral variant (beta)' : undefined}
              >
                {n}
              </button>
            ))}
          </div>
        </Section>

        {/* Host seat */}
        <Section title="Your Commander">
          <div className="flex gap-3">
            <input
              type="text"
              value={hostName}
              onChange={(e) => setHostName(e.target.value)}
              className="flex-1 border border-line bg-panel px-3 py-2 font-display text-sm text-ink focus:border-hot focus:outline-none"
              placeholder="Commander name"
              maxLength={20}
            />
            <div className="flex gap-1">
              {PALETTE.slice(0, 5).map((p, paletteIdx) => (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => setHostColorIdx(paletteIdx)}
                  title={p.name}
                  className="h-8 w-8 border-2 transition-all"
                  style={{
                    background: p.color,
                    borderColor: hostColorIdx === paletteIdx ? 'var(--hot)' : 'transparent',
                  }}
                />
              ))}
            </div>
          </div>
        </Section>

        {/* Other seats */}
        <Section title="Other Players">
          {otherSeats.map((seat, i) => (
            <div key={`seat-${i + 1}`} className="flex items-center gap-2">
              <input
                type="text"
                value={seat.name}
                onChange={(e) => updateSeat(i, { name: e.target.value })}
                className="flex-1 border border-line bg-panel px-3 py-1.5 font-display text-sm text-ink focus:border-hot focus:outline-none"
                maxLength={20}
              />
              <button
                type="button"
                onClick={() => updateSeat(i, { isAI: !seat.isAI })}
                className={`border px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest transition-colors ${
                  seat.isAI
                    ? 'border-line text-ink-faint hover:border-line-2'
                    : 'border-hot bg-hot/10 text-hot'
                }`}
              >
                {seat.isAI ? 'AI' : 'Human'}
              </button>
            </div>
          ))}
        </Section>

        {/* Seed */}
        <Section title="Seed">
          <div className="flex gap-2">
            <input
              type="text"
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
              className="flex-1 border border-line bg-panel px-3 py-2 font-mono text-sm text-ink-dim focus:border-hot focus:outline-none"
              placeholder="game seed"
            />
            <button
              type="button"
              onClick={() => setSeed(randomSeed())}
              className="border border-line px-3 font-mono text-[10px] uppercase tracking-widest text-ink-faint hover:border-line-2 hover:text-ink-dim"
            >
              Rng
            </button>
          </div>
        </Section>

        {/* Launch */}
        <button
          type="button"
          onClick={handleLaunch}
          className="w-full border border-hot bg-hot/10 py-3 font-display tracking-[0.2em] text-hot hover:bg-hot/20"
        >
          LAUNCH
        </button>

        <button
          type="button"
          onClick={() => void navigate('/')}
          className="w-full border border-line py-2 font-mono text-[10px] uppercase tracking-widest text-ink-faint hover:border-line-2 hover:text-ink-dim"
        >
          Back
        </button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-ink-ghost">{title}</p>
      {children}
    </div>
  );
}
