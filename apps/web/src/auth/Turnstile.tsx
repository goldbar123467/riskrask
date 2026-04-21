/**
 * Cloudflare Turnstile widget.
 *
 * Loads the Turnstile script once on mount, renders the widget into a
 * dedicated div, and pipes the verification token up via `onToken`. When the
 * token expires (~5 min) or fails, the parent is notified via `onExpire` /
 * `onError` and the widget auto-resets.
 *
 * When `siteKey` is empty (e.g. local dev without a key), the component
 * renders nothing and immediately reports a null token so the caller can
 * continue without a captcha requirement.
 */

import { useEffect, useRef } from 'react';

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: {
          sitekey: string;
          theme?: 'light' | 'dark' | 'auto';
          size?: 'normal' | 'flexible' | 'compact';
          callback?: (token: string) => void;
          'expired-callback'?: () => void;
          'error-callback'?: () => void;
        },
      ) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

interface TurnstileProps {
  siteKey: string;
  onToken: (token: string | null) => void;
}

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let scriptPromise: Promise<void> | null = null;

function loadTurnstile(): Promise<void> {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    if (typeof document === 'undefined') {
      resolve();
      return;
    }
    if (window.turnstile) {
      resolve();
      return;
    }
    const s = document.createElement('script');
    s.src = SCRIPT_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('turnstile-load-failed'));
    document.head.appendChild(s);
  });
  return scriptPromise;
}

export function Turnstile({ siteKey, onToken }: TurnstileProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!siteKey) {
      onToken(null);
      return;
    }
    let cancelled = false;

    loadTurnstile()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          theme: 'dark',
          size: 'flexible',
          callback: (token) => onToken(token),
          'expired-callback': () => onToken(null),
          'error-callback': () => onToken(null),
        });
      })
      .catch(() => {
        /* swallow — the parent keeps its submit disabled if token stays null */
      });

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          /* widget already gone */
        }
        widgetIdRef.current = null;
      }
    };
  }, [siteKey, onToken]);

  if (!siteKey) return null;
  return <div ref={containerRef} data-testid="turnstile-widget" className="min-h-[65px]" />;
}
