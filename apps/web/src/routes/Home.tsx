import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGame } from '../game/useGame';
import { loadSave } from '../net/api';

/**
 * Landing page: new-game / enter-save-code / resume last.
 * Also handles ?save=CODE URL parameter on mount.
 */
export function Home() {
  const navigate = useNavigate();
  const loadState = useGame((s) => s.loadState);
  const existingState = useGame((s) => s.state);

  const [saveCode, setSaveCode] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Handle ?save=CODE in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('save');
    if (!code) return;

    setLoading(true);
    void loadSave(code.toUpperCase().replace('-', '')).then((result) => {
      setLoading(false);
      if (result.ok) {
        loadState(result.data.state);
        void navigate('/play');
      } else {
        const msg =
          result.code === 'SAVE_NOT_FOUND'
            ? 'Save not found. It may have been deleted.'
            : result.code === 'SAVE_EXPIRED'
              ? 'Save expired. Anonymous saves last 30 days.'
              : 'Could not load save. Please try again.';
        setLoadError(msg);
      }
    });
  }, [loadState, navigate]);

  async function handleLoadCode() {
    const code = saveCode.toUpperCase().replace(/[^23456789ABCDEFGHJKMNPQRSTUVWXYZ]/g, '');
    if (code.length !== 8) {
      setLoadError('Save codes are 8 characters (e.g. XXXX-XXXX)');
      return;
    }
    setLoading(true);
    setLoadError(null);
    const result = await loadSave(code);
    setLoading(false);
    if (result.ok) {
      loadState(result.data.state);
      void navigate('/play');
    } else {
      const msg =
        result.code === 'SAVE_NOT_FOUND'
          ? 'Save not found.'
          : result.code === 'SAVE_EXPIRED'
            ? 'Save expired.'
            : 'Failed to load save.';
      setLoadError(msg);
    }
  }

  return (
    <main
      className="flex h-full flex-col items-center justify-center gap-8 bg-bg-0 px-8"
      style={{
        background:
          'radial-gradient(ellipse 1400px 900px at 55% 40%, #0f131a 0%, #070809 70%), var(--bg-0)',
      }}
    >
      {/* Logo */}
      <div className="flex flex-col items-center gap-3">
        <div className="relative h-8 w-8">
          <div className="absolute inset-0 rotate-45 border border-ink" />
          <div
            className="absolute h-[7px] w-[7px] bg-hot"
            style={{ top: 12, left: 12, boxShadow: '0 0 14px var(--hot-glow)' }}
          />
        </div>
        <h1 className="font-display text-sm font-medium tracking-[0.36em] text-ink">RISKRASK</h1>
        <span className="font-mono text-[10px] tracking-[0.12em] text-ink-faint">
          v3 · COMMAND CONSOLE
        </span>
      </div>

      {/* Actions */}
      <div className="flex w-full max-w-xs flex-col gap-3">
        {loading ? (
          <p className="text-center font-mono text-sm text-ink-faint">Loading save…</p>
        ) : (
          <>
            <button
              type="button"
              onClick={() => void navigate('/setup')}
              className="border border-hot bg-hot/10 py-3 font-display tracking-[0.2em] text-hot hover:bg-hot/20"
              data-testid="new-game-btn"
            >
              NEW GAME
            </button>

            <button
              type="button"
              onClick={() => void navigate('/lobby')}
              className="border border-line py-2 font-mono text-[10px] uppercase tracking-widest text-ink-dim hover:border-line-2 hover:text-ink"
              data-testid="multiplayer-btn"
            >
              Multiplayer
            </button>

            {existingState && (
              <button
                type="button"
                onClick={() => void navigate('/play')}
                className="border border-line py-2 font-mono text-[10px] uppercase tracking-widest text-ink-dim hover:border-line-2 hover:text-ink"
              >
                Resume Last Game
              </button>
            )}

            <div className="flex flex-col gap-2 border-t border-line pt-4">
              <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink-ghost">
                Enter Save Code
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={saveCode}
                  onChange={(e) => setSaveCode(e.target.value.toUpperCase())}
                  placeholder="XXXX-XXXX"
                  maxLength={9}
                  className="flex-1 border border-line bg-panel px-3 py-2 font-mono text-sm text-ink placeholder:text-ink-ghost focus:border-hot focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => void handleLoadCode()}
                  className="border border-line px-4 font-mono text-[10px] uppercase tracking-widest text-ink-faint hover:border-line-2 hover:text-ink-dim"
                >
                  Load
                </button>
              </div>
              {loadError && <p className="font-mono text-[9px] text-danger">{loadError}</p>}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
