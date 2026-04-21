import { AnimatePresence, motion } from 'framer-motion';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useReducedMotion } from '../hooks/useReducedMotion';

export type ToastTone = 'info' | 'ok' | 'warn' | 'danger';

export interface ToastItem {
  readonly id: string;
  readonly text: string;
  readonly tone: ToastTone;
  /** Dwell in ms before auto-dismiss. Defaults to 3200ms. */
  readonly ttl?: number;
}

interface ToastContextValue {
  push: (text: string, opts?: { tone?: ToastTone; ttl?: number }) => string;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/**
 * Hook — call `push('boom', { tone: 'danger' })` anywhere below a ToastHost.
 * Safe to call even when no provider is mounted (no-op + console warn once).
 */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (ctx) return ctx;
  return { push: () => '', dismiss: () => {} };
}

interface ToastHostProps {
  children?: React.ReactNode;
}

/**
 * Top-centre toast host. Manages a simple FIFO queue with auto-dismiss.
 * Siblings use the `useToast()` hook to push messages.
 */
export function ToastHost({ children }: ToastHostProps) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const reduced = useReducedMotion();

  const dismiss = useCallback((id: string) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
    const h = timers.current.get(id);
    if (h) {
      clearTimeout(h);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback<ToastContextValue['push']>(
    (text, opts) => {
      const id = `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      const item: ToastItem = { id, text, tone: opts?.tone ?? 'info', ttl: opts?.ttl ?? 3200 };
      setItems((prev) => [...prev, item]);
      const h = setTimeout(() => dismiss(id), item.ttl);
      timers.current.set(id, h);
      return id;
    },
    [dismiss],
  );

  useEffect(() => {
    const handles = timers.current;
    return () => {
      for (const h of handles.values()) clearTimeout(h);
      handles.clear();
    };
  }, []);

  const value = useMemo<ToastContextValue>(() => ({ push, dismiss }), [push, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-label="toast-host"
        aria-live="polite"
        className="pointer-events-none fixed left-1/2 top-4 z-[60] flex -translate-x-1/2 flex-col items-center gap-2"
      >
        <AnimatePresence initial={false}>
          {items.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={reduced ? { opacity: 0 } : { opacity: 0, y: -12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.98 }}
              transition={{ duration: reduced ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
              className={`pointer-events-auto border bg-bg-0/95 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.18em] backdrop-blur ${toneClass(t.tone)}`}
              role={t.tone === 'danger' || t.tone === 'warn' ? 'alert' : 'status'}
              onClick={() => dismiss(t.id)}
            >
              {t.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

function toneClass(tone: ToastTone): string {
  switch (tone) {
    case 'ok':
      return 'border-[color:var(--ok)] text-[color:var(--ok)]';
    case 'warn':
      return 'border-[color:var(--warn)] text-[color:var(--warn)]';
    case 'danger':
      return 'border-[color:var(--danger)] text-[color:var(--danger)]';
    default:
      return 'border-line text-ink-dim';
  }
}
