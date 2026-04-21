import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGame } from '../game/useGame';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { loadSave } from '../net/api';

/**
 * Landing page: new-game / enter-save-code / resume last.
 * Also handles ?save=CODE URL parameter on mount.
 */
export function Home() {
  const navigate = useNavigate();
  const reduced = useReducedMotion();
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

  const tapProps = reduced ? {} : { whileTap: { scale: 0.96 } };
  const hoverScaleProps = reduced ? {} : { whileHover: { scale: 1.02 } };
  const hoverGlowProps = reduced
    ? {}
    : { whileHover: { boxShadow: '0 0 18px rgba(255,77,46,0.35)' } };

  return (
    <main
      className="flex h-full flex-col items-center justify-center gap-8 bg-bg-0 px-8"
      style={{
        background:
          'radial-gradient(ellipse 1400px 900px at 55% 40%, #0f131a 0%, #070809 70%), var(--bg-0)',
      }}
    >
      {/* Logo */}
      <motion.div
        className="flex flex-col items-center gap-3"
        initial={reduced ? { opacity: 0 } : { opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduced ? 0 : 0.4, ease: [0.22, 1, 0.36, 1] }}
      >
        <motion.div
          className="relative h-8 w-8"
          initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.4, y: -20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{
            duration: reduced ? 0 : 0.7,
            delay: reduced ? 0 : 0.05,
            ease: reduced ? 'linear' : [0.34, 1.56, 0.64, 1],
          }}
        >
          <div className="absolute inset-0 rotate-45 border border-ink" />
          <div
            className="absolute h-[7px] w-[7px] bg-hot"
            style={{
              top: 12,
              left: 12,
              boxShadow: '0 0 14px var(--hot-glow)',
              animation: reduced ? undefined : 'pulseGlow 2400ms ease-in-out infinite',
            }}
          />
        </motion.div>
        <h1 className="font-display text-sm font-medium tracking-[0.36em] text-ink">RISKRASK</h1>
        <span className="font-mono text-[10px] tracking-[0.12em] text-ink-faint">
          v3 · COMMAND CONSOLE
        </span>
      </motion.div>

      {/* Actions */}
      <div className="flex w-full max-w-xs flex-col gap-3">
        {loading ? (
          <div className="flex flex-col items-center gap-2 py-2">
            <Spinner />
            <p className="text-center font-mono text-[11px] uppercase tracking-[0.2em] text-ink-faint">
              Loading save…
            </p>
          </div>
        ) : (
          <>
            <motion.button
              type="button"
              onClick={() => void navigate('/setup')}
              className="border border-hot bg-hot/10 py-3 font-display tracking-[0.2em] text-hot transition-colors hover:bg-hot/20"
              style={{ boxShadow: 'var(--shadow-hot-glow)' }}
              data-testid="new-game-btn"
              {...tapProps}
              {...hoverScaleProps}
              transition={{ duration: 0.12, ease: [0.22, 1, 0.36, 1] }}
            >
              NEW GAME
            </motion.button>

            <motion.button
              type="button"
              onClick={() => void navigate('/lobby')}
              className="border border-line py-2 font-mono text-[10px] uppercase tracking-widest text-ink-dim transition-all hover:border-hot hover:text-hot"
              data-testid="multiplayer-btn"
              {...hoverGlowProps}
              {...tapProps}
              transition={{ duration: 0.12, ease: [0.22, 1, 0.36, 1] }}
            >
              Multiplayer
            </motion.button>

            {existingState && (
              <motion.button
                type="button"
                onClick={() => void navigate('/play')}
                className="border border-line py-2 font-mono text-[10px] uppercase tracking-widest text-ink-dim hover:border-line-2 hover:text-ink"
                {...tapProps}
                transition={{ duration: 0.12 }}
              >
                Resume Last Game
              </motion.button>
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
                <motion.button
                  type="button"
                  onClick={() => void handleLoadCode()}
                  className="border border-line px-4 font-mono text-[10px] uppercase tracking-widest text-ink-faint hover:border-line-2 hover:text-ink-dim"
                  {...tapProps}
                  transition={{ duration: 0.12 }}
                >
                  Load
                </motion.button>
              </div>
              {loadError && <p className="font-mono text-[9px] text-danger">{loadError}</p>}
            </div>
          </>
        )}
      </div>
    </main>
  );
}

/** Tiny rotating diamond — re-uses the brand glyph as a spinner. */
function Spinner() {
  return (
    <output aria-label="loading" className="relative inline-block h-5 w-5 animate-spin">
      <span className="absolute inset-0 rotate-45 border border-hot/70" />
      <span
        className="absolute h-[6px] w-[6px] bg-hot"
        style={{ top: 7, left: 7, boxShadow: '0 0 8px var(--hot-glow)' }}
      />
    </output>
  );
}
