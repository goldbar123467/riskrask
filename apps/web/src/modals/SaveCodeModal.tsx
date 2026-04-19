import type { GameState } from '@riskrask/engine';
import { useState } from 'react';
import { createSave } from '../net/api';

interface SaveCodeModalProps {
  state: GameState;
  onClose: () => void;
}

/**
 * POST /api/saves, display XXXX-XXXX, copy + URL.
 * Cancel + Confirm pair.
 */
export function SaveCodeModal({ state, onClose }: SaveCodeModalProps) {
  const [code, setCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setLoading(true);
    setError(null);
    const result = await createSave(state);
    setLoading(false);
    if (result.ok) {
      setCode(result.data.code);
    } else {
      setError(result.detail ?? 'Save failed');
    }
  }

  const formatted = code ? `${code.substring(0, 4)}-${code.substring(4, 8)}` : null;

  const url = code ? `https://upsidedownatlas.com/?save=${code}` : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <dialog
        className="flex w-[380px] flex-col gap-5 border border-line bg-bg-0 p-7"
        aria-label="save-code-modal"
        open
      >
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink-faint">
            Save Game
          </p>
          <h2 className="font-display text-xl text-ink">Share Code</h2>
        </div>

        {!code ? (
          <p className="font-mono text-[10px] text-ink-faint">
            Generate a save code to resume this game later from any device.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between border border-hot bg-hot/5 px-4 py-3">
              <span className="font-display text-2xl tracking-[0.2em] text-hot">{formatted}</span>
              <button
                type="button"
                onClick={() => url && void navigator.clipboard.writeText(url)}
                className="font-mono text-[9px] uppercase tracking-widest text-ink-faint hover:text-ink"
              >
                Copy URL
              </button>
            </div>
            <p className="break-all font-mono text-[8px] text-ink-ghost">{url}</p>
          </div>
        )}

        {error && <p className="font-mono text-[10px] text-danger">{error}</p>}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 border border-line py-2 font-mono text-[10px] uppercase tracking-widest text-ink-dim hover:border-line-2 hover:text-ink"
          >
            Close
          </button>
          {!code && (
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={loading}
              className="flex-1 border border-hot bg-hot/10 py-2 font-mono text-[10px] uppercase tracking-widest text-hot hover:bg-hot/20 disabled:opacity-50"
            >
              {loading ? 'Saving…' : 'Save'}
            </button>
          )}
        </div>
      </dialog>
    </div>
  );
}
