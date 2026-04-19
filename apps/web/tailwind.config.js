/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'bg-0': 'var(--bg-0)',
        'bg-1': 'var(--bg-1)',
        amber: 'var(--amber)',
        'amber-2': 'var(--amber-2)',
        crimson: 'var(--crimson)',
        sapphire: 'var(--sapphire)',
        emerald: 'var(--emerald)',
        violet: 'var(--violet)',
        rose: 'var(--rose)',
        neutral: 'var(--neutral)',
        'text-1': 'var(--text-1)',
        'text-2': 'var(--text-2)',
        'text-3': 'var(--text-3)',
      },
      fontFamily: {
        serif: ['"Cormorant Garamond"', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
};
