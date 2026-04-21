/**
 * AuthPanel — Sign In / Sign Up switcher.
 *
 * Replaces the sprint-2 "paste-a-JWT" stopgap in the Lobby route.
 *
 *  - Sign In: email + password → `supabase.auth.signInWithPassword`.
 *  - Sign Up: email + password + username + display name (opt) → `signUp`
 *    with the Turnstile captcha token forwarded via `options.captchaToken`.
 *    The Supabase trigger `handle_new_user()` reads `options.data` and
 *    creates the `profiles` row (username + display_name).
 *
 * Error surfaces:
 *  - Input validation runs client-side (email shape, password length,
 *    username regex that matches the DB check).
 *  - Supabase errors map to short user-facing strings.
 *  - When Supabase isn't configured (env vars missing), the panel renders a
 *    single "sign in with dev token" textarea as a last-resort escape hatch.
 *    This keeps local dev + jsdom tests working.
 */

import { type FormEvent, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TURNSTILE_SITE_KEY, getSupabase, isSupabaseConfigured } from '../net/supabase';
import { Turnstile } from './Turnstile';

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

type Tab = 'signin' | 'signup';

export interface AuthPanelProps {
  /** Called only in the legacy (no-Supabase-configured) path. */
  onLegacyToken?: ((t: string) => void) | undefined;
}

export function AuthPanel({ onLegacyToken }: AuthPanelProps) {
  const [tab, setTab] = useState<Tab>('signin');
  const navigate = useNavigate();

  return (
    <main className="flex h-full min-h-screen flex-col items-center justify-center gap-6 bg-bg-0 px-6">
      <LobbyHeader />

      <div className="flex w-full max-w-sm flex-col gap-3">
        {isSupabaseConfigured() ? (
          <>
            <TabBar active={tab} onChange={setTab} />
            {tab === 'signin' ? <SignInForm /> : <SignUpForm onSuccess={() => setTab('signin')} />}
          </>
        ) : (
          <LegacyTokenForm onToken={onLegacyToken} />
        )}

        <button
          type="button"
          onClick={() => void navigate('/')}
          className="self-start border border-line px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-ink-faint hover:border-line-2 hover:text-ink-dim"
        >
          ← Back home
        </button>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Chrome
// ---------------------------------------------------------------------------

function LobbyHeader() {
  return (
    <header className="flex flex-col items-center gap-2">
      <div className="relative h-7 w-7">
        <div className="absolute inset-0 rotate-45 border border-ink" />
        <div className="absolute h-[6px] w-[6px] bg-hot" style={{ top: 11, left: 11 }} />
      </div>
      <h1 className="font-display text-sm tracking-[0.36em] text-ink">RISKRASK · LOBBY</h1>
      <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink-ghost">
        Sign in to play multiplayer
      </p>
    </header>
  );
}

function TabBar({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  return (
    <div className="flex border border-line bg-panel">
      {(['signin', 'signup'] as const).map((t) => (
        <button
          key={t}
          type="button"
          data-testid={t === 'signin' ? 'tab-signin' : 'tab-signup'}
          onClick={() => onChange(t)}
          className={`flex-1 border-r border-line py-2 font-mono text-[10px] uppercase tracking-[0.22em] last:border-r-0 ${
            active === t ? 'bg-hot/10 text-hot' : 'text-ink-faint hover:text-ink-dim'
          }`}
        >
          {t === 'signin' ? 'Sign in' : 'Sign up'}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sign in
// ---------------------------------------------------------------------------

function SignInForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    const supa = getSupabase();
    if (!supa) {
      setError('Auth service unavailable.');
      return;
    }
    if (!email.includes('@')) {
      setError('Enter a valid email.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setError(null);
    setBusy(true);
    const res = await supa.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (res.error) {
      setError(mapAuthError(res.error.message));
      return;
    }
    // Session propagates to useAuth via onAuthStateChange — nothing else to do.
  }

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className="flex flex-col gap-3 border border-line bg-panel p-4"
      data-testid="signin-form"
    >
      <EmailInput value={email} onChange={setEmail} testId="signin-email" />
      <PasswordInput value={password} onChange={setPassword} testId="signin-password" />

      <button
        type="submit"
        data-testid="signin-submit"
        disabled={busy}
        className="border border-hot bg-hot/10 py-2 font-display tracking-[0.2em] text-hot hover:bg-hot/20 disabled:opacity-50"
      >
        {busy ? 'Signing in…' : 'SIGN IN'}
      </button>

      {error && (
        <p data-testid="signin-error" className="font-mono text-[9px] text-danger">
          {error}
        </p>
      )}
    </form>
  );
}

// ---------------------------------------------------------------------------
// Sign up
// ---------------------------------------------------------------------------

function SignUpForm({ onSuccess }: { onSuccess: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const captchaRequired = Boolean(TURNSTILE_SITE_KEY);

  const onToken = useCallback((t: string | null) => {
    setCaptcha(t);
  }, []);

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    const supa = getSupabase();
    if (!supa) {
      setError('Auth service unavailable.');
      return;
    }
    if (!email.includes('@')) {
      setError('Enter a valid email.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (!USERNAME_RE.test(username)) {
      setError('Username: 3–20 chars, letters / digits / underscore only.');
      return;
    }
    if (captchaRequired && !captcha) {
      setError('Complete the captcha challenge.');
      return;
    }
    setError(null);
    setInfo(null);
    setBusy(true);

    const res = await supa.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          username,
          display_name: displayName.trim() || username,
        },
        ...(captcha ? { captchaToken: captcha } : {}),
      },
    });
    setBusy(false);

    if (res.error) {
      setError(mapAuthError(res.error.message));
      return;
    }
    // With "Confirm email" enabled there's no session yet — tell the user to
    // check their inbox. With it disabled we already have a session and the
    // useAuth hook will flip us into the authed state.
    if (res.data.session) {
      setInfo('Account created. Signing you in…');
      return;
    }
    setInfo('Check your inbox to confirm your email, then sign in.');
    onSuccess();
  }

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className="flex flex-col gap-3 border border-line bg-panel p-4"
      data-testid="signup-form"
    >
      <EmailInput value={email} onChange={setEmail} testId="signup-email" autoComplete="email" />
      <PasswordInput
        value={password}
        onChange={setPassword}
        testId="signup-password"
        autoComplete="new-password"
        hint="min 6 chars"
      />
      <LabeledInput
        label="Username"
        value={username}
        onChange={(v) => setUsername(v.toLowerCase())}
        testId="signup-username"
        hint="3–20 · a–z 0–9 _"
        autoComplete="username"
      />
      <LabeledInput
        label="Display name (optional)"
        value={displayName}
        onChange={setDisplayName}
        testId="signup-display-name"
        autoComplete="nickname"
      />

      {captchaRequired && <Turnstile siteKey={TURNSTILE_SITE_KEY} onToken={onToken} />}

      <button
        type="submit"
        data-testid="signup-submit"
        disabled={busy}
        className="border border-hot bg-hot/10 py-2 font-display tracking-[0.2em] text-hot hover:bg-hot/20 disabled:opacity-50"
      >
        {busy ? 'Creating…' : 'CREATE ACCOUNT'}
      </button>

      {error && (
        <p data-testid="signup-error" className="font-mono text-[9px] text-danger">
          {error}
        </p>
      )}
      {info && (
        <p data-testid="signup-info" className="font-mono text-[9px] text-ok">
          {info}
        </p>
      )}
    </form>
  );
}

// ---------------------------------------------------------------------------
// Shared input primitives
// ---------------------------------------------------------------------------

function EmailInput({
  value,
  onChange,
  testId,
  autoComplete = 'email',
}: {
  value: string;
  onChange: (v: string) => void;
  testId: string;
  autoComplete?: string;
}) {
  return (
    <LabeledInput
      label="Email"
      value={value}
      onChange={onChange}
      type="email"
      testId={testId}
      autoComplete={autoComplete}
    />
  );
}

function PasswordInput({
  value,
  onChange,
  testId,
  autoComplete = 'current-password',
  hint,
}: {
  value: string;
  onChange: (v: string) => void;
  testId: string;
  autoComplete?: string;
  hint?: string;
}) {
  return (
    <LabeledInput
      label="Password"
      value={value}
      onChange={onChange}
      type="password"
      testId={testId}
      autoComplete={autoComplete}
      {...(hint !== undefined ? { hint } : {})}
    />
  );
}

interface LabeledInputProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  testId: string;
  autoComplete?: string;
  hint?: string;
}

function LabeledInput({
  label,
  value,
  onChange,
  type = 'text',
  testId,
  autoComplete,
  hint,
}: LabeledInputProps) {
  const id = `rr-${testId}`;
  return (
    <label htmlFor={id} className="flex flex-col gap-1">
      <span className="flex items-baseline justify-between">
        <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink-ghost">
          {label}
        </span>
        {hint && (
          <span className="font-mono text-[8px] uppercase tracking-widest text-ink-faint">
            {hint}
          </span>
        )}
      </span>
      <input
        id={id}
        type={type}
        value={value}
        data-testid={testId}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        className="border border-line bg-bg-0 px-3 py-2 font-mono text-sm text-ink placeholder:text-ink-ghost focus:border-hot focus:outline-none"
      />
    </label>
  );
}

// ---------------------------------------------------------------------------
// Legacy fallback (no Supabase configured) — preserved for jsdom tests + dev
// ---------------------------------------------------------------------------

function LegacyTokenForm({ onToken }: { onToken?: ((t: string) => void) | undefined }) {
  const [value, setValue] = useState('');

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (trimmed.length === 0) return;
    onToken?.(trimmed);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 border border-line bg-panel p-4">
      <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink-faint">
        Supabase unavailable — dev-token fallback
      </p>
      <label
        htmlFor="rr-token"
        className="font-mono text-[9px] uppercase tracking-[0.16em] text-ink-ghost"
      >
        Paste access token
      </label>
      <textarea
        id="rr-token"
        data-testid="token-input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={3}
        className="border border-line bg-bg-0 px-3 py-2 font-mono text-xs text-ink placeholder:text-ink-ghost focus:border-hot focus:outline-none"
        placeholder="eyJhbGciOi…"
      />
      <button
        type="submit"
        data-testid="token-submit"
        className="border border-hot bg-hot/10 py-2 font-display tracking-[0.2em] text-hot hover:bg-hot/20"
      >
        CONTINUE
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Error mapping
// ---------------------------------------------------------------------------

function mapAuthError(raw: string): string {
  const s = raw.toLowerCase();
  if (s.includes('invalid login') || s.includes('invalid credentials'))
    return 'Wrong email or password.';
  if (s.includes('email not confirmed')) return 'Confirm your email before signing in.';
  if (s.includes('user already registered')) return 'An account with that email already exists.';
  if (s.includes('rate limit')) return 'Too many attempts. Try again in a minute.';
  if (s.includes('captcha')) return 'Captcha verification failed. Retry the challenge.';
  if (s.includes('weak password')) return 'Password too weak.';
  if (s.includes('username')) return 'Username taken or invalid.';
  return raw;
}
