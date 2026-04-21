/**
 * AuthPanel tests — guard the two seams we care about:
 *   (a) when Supabase is not configured, a dev-token fallback form appears
 *       (legacy escape hatch that keeps the Lobby.test.tsx harness working);
 *   (b) when Supabase IS configured, the Sign In / Sign Up tabs render and
 *       the sign-up submit calls `supabase.auth.signUp` with the right
 *       user_metadata shape + captchaToken when Turnstile is present.
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthPanel } from './AuthPanel';

vi.mock('../net/supabase', () => {
  const state = {
    configured: false,
    signInWithPassword: vi.fn(async () => ({ error: null, data: { session: null } })),
    signUp: vi.fn(async () => ({ error: null, data: { session: null } })),
  };
  return {
    TURNSTILE_SITE_KEY: '',
    isSupabaseConfigured: () => state.configured,
    getSupabase: () =>
      state.configured
        ? {
            auth: {
              signInWithPassword: state.signInWithPassword,
              signUp: state.signUp,
            },
          }
        : null,
    __state: state,
  };
});

const supaMock = (await import('../net/supabase')) as unknown as {
  __state: {
    configured: boolean;
    signInWithPassword: ReturnType<typeof vi.fn>;
    signUp: ReturnType<typeof vi.fn>;
  };
};

afterEach(() => {
  supaMock.__state.configured = false;
  supaMock.__state.signInWithPassword.mockClear();
  supaMock.__state.signUp.mockClear();
});

function renderPanel() {
  return render(
    <MemoryRouter>
      <AuthPanel />
    </MemoryRouter>,
  );
}

describe('AuthPanel (legacy fallback)', () => {
  it('renders the dev-token form when Supabase is not configured', () => {
    supaMock.__state.configured = false;
    renderPanel();
    expect(screen.getByTestId('token-input')).toBeInTheDocument();
    expect(screen.getByTestId('token-submit')).toBeInTheDocument();
  });
});

describe('AuthPanel (Supabase configured)', () => {
  it('renders sign-in by default and exposes the tab switcher', () => {
    supaMock.__state.configured = true;
    renderPanel();
    expect(screen.getByTestId('signin-form')).toBeInTheDocument();
    expect(screen.getByTestId('tab-signin')).toBeInTheDocument();
    expect(screen.getByTestId('tab-signup')).toBeInTheDocument();
  });

  it('switches to the sign-up form and submits with username metadata', async () => {
    supaMock.__state.configured = true;
    renderPanel();
    const user = userEvent.setup();

    await user.click(screen.getByTestId('tab-signup'));
    await user.type(screen.getByTestId('signup-email'), 'player@example.com');
    await user.type(screen.getByTestId('signup-password'), 'hunter22');
    await user.type(screen.getByTestId('signup-username'), 'commander');
    await user.click(screen.getByTestId('signup-submit'));

    await waitFor(() => expect(supaMock.__state.signUp).toHaveBeenCalledOnce());
    const arg = supaMock.__state.signUp.mock.calls[0]?.[0] as {
      email: string;
      password: string;
      options: {
        data: { username: string; display_name: string };
        captchaToken?: string;
      };
    };
    expect(arg.email).toBe('player@example.com');
    expect(arg.password).toBe('hunter22');
    expect(arg.options.data.username).toBe('commander');
    expect(arg.options.data.display_name).toBe('commander');
    // No Turnstile configured → no captchaToken key.
    expect(arg.options.captchaToken).toBeUndefined();
  });

  it('blocks sign-up with an invalid username', async () => {
    supaMock.__state.configured = true;
    renderPanel();
    const user = userEvent.setup();
    await user.click(screen.getByTestId('tab-signup'));
    await user.type(screen.getByTestId('signup-email'), 'p@e.com');
    await user.type(screen.getByTestId('signup-password'), 'hunter22');
    await user.type(screen.getByTestId('signup-username'), 'no'); // too short
    await user.click(screen.getByTestId('signup-submit'));
    expect(await screen.findByTestId('signup-error')).toBeInTheDocument();
    expect(supaMock.__state.signUp).not.toHaveBeenCalled();
  });

  it('signs in with email + password', async () => {
    supaMock.__state.configured = true;
    renderPanel();
    const user = userEvent.setup();
    await user.type(screen.getByTestId('signin-email'), 'me@example.com');
    await user.type(screen.getByTestId('signin-password'), 'secret123');
    await user.click(screen.getByTestId('signin-submit'));
    await waitFor(() => expect(supaMock.__state.signInWithPassword).toHaveBeenCalledOnce());
    const arg = supaMock.__state.signInWithPassword.mock.calls[0]?.[0] as {
      email: string;
      password: string;
    };
    expect(arg.email).toBe('me@example.com');
    expect(arg.password).toBe('secret123');
  });
});
