# Riskrask v3 — Master Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement each track-level plan. Steps use checkbox syntax for tracking.

**Goal:** Replace `riskindex-v2-mobile.html` with a production TypeScript monorepo covering solo + multiplayer Risk, share-code saves, admin panel, and replays.

**Architecture:** Bun workspace. Pure TS engine (`packages/engine`) + AI (`packages/ai`) shared between a Vite/React client (`apps/web`), a Bun/Hono server (`apps/server`), and a Vite/React admin (`apps/admin`). Supabase for Postgres/Auth/Realtime. Cloudflare for static hosting + Access + Turnstile.

**Tech Stack:** TypeScript 5, Bun, Vite 5, React 18, Hono, Tailwind, Zustand, Supabase JS, zod, Biome, Vitest + Bun test, Playwright.

---

## Execution shape

The build is divided into tracks. Phase 0 is sequential and sets up the monorepo. Phases 1–3 can run tracks in parallel worktrees.

```
Phase 0  ┌──────────────────────┐
         │  A: Scaffold monorepo │   (sequential, prerequisite)
         └──────────┬────────────┘
                    │
Phase 1  ┌──────────┴──────────┬──────────┬──────────┐
         │  B: Engine port      │  C: AI  │  D: UI   │  E: Server + saves
         │                      │         │         │     + Supabase
         └──────────┬───────────┴────┬────┴────┬────┴──────┬──────┘
                    │                │         │           │
Phase 2             └───────┬────────┴────┬────┴───────────┘
                            │  F: Auth + rooms + multiplayer turn loop + timer + AI fallback
                            └──────┬───────────────────────┘
                                   │
Phase 3                     ┌──────┴──────┬─────────────────┐
                            │  G: Admin   │  H: Replay +    │
                            │     panel   │     analytics   │
                            └─────────────┴─────────────────┘
```

Each track has its own plan file in `docs/superpowers/plans/`. This master document is an index + the Phase-0 scaffold task-list.

## Track index

| Phase | Track | Plan file |
|---|---|---|
| 0 | A. Scaffold | _inline below_ |
| 1 | B. Engine port | `2026-04-19-track-b-engine.md` |
| 1 | C. AI port | `2026-04-19-track-c-ai.md` |
| 1 | D. React client shell | `2026-04-19-track-d-web.md` |
| 1 | E. Server + Supabase + save codes | `2026-04-19-track-e-server.md` |
| 2 | F. Auth + rooms + multiplayer | `2026-04-19-track-f-multiplayer.md` |
| 3 | G. Admin panel | `2026-04-19-track-g-admin.md` |
| 3 | H. Replay + analytics | `2026-04-19-track-h-replay.md` |

## Phase 0 — Scaffold (Track A, sequential)

**Worktree:** none. This work happens on `main` and must complete before any track branch is cut.

**Files:**
- Create: `package.json`, `bun.lockb`, `bunfig.toml`, `biome.json`, `tsconfig.base.json`, `.gitignore` (merge), `.nvmrc`
- Create: `apps/web/`, `apps/server/`, `apps/admin/` (each with its own `package.json`, `tsconfig.json`, `src/`)
- Create: `packages/engine/`, `packages/ai/`, `packages/shared/` (each with `package.json`, `tsconfig.json`, `src/index.ts`)
- Create: `supabase/config.toml`, `supabase/migrations/`, `supabase/functions/`
- Create: `infra/cloudflare/wrangler.toml`
- Create: `.github/workflows/ci.yml`
- Create: `README.md` with one-paragraph description and `bun install && bun dev` instructions
- Move: `riskindex-v2-mobile.html` → `archive/riskindex-v2-mobile.html` (keep in git so references work)

### Steps

- [ ] **Step 1: Initialize root `package.json` with workspaces**

```json
{
  "name": "riskrask",
  "private": true,
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "dev": "bun run --filter '*' dev",
    "build": "bun run --filter '*' build",
    "test": "bun run --filter '*' test",
    "lint": "biome check .",
    "format": "biome format --write .",
    "typecheck": "bun run --filter '*' typecheck"
  },
  "devDependencies": {
    "@biomejs/biome": "^1.9.0",
    "typescript": "^5.6.0"
  }
}
```

- [ ] **Step 2: Add root `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM", "DOM.Iterable"]
  }
}
```

- [ ] **Step 3: Add `biome.json`**

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.0/schema.json",
  "organizeImports": { "enabled": true },
  "linter": { "enabled": true, "rules": { "recommended": true } },
  "formatter": { "enabled": true, "indentStyle": "space", "indentWidth": 2, "lineWidth": 100 },
  "javascript": { "formatter": { "quoteStyle": "single", "semicolons": "always" } },
  "files": { "ignore": ["archive/**", "**/dist/**", "**/.next/**", "**/node_modules/**", "supabase/.branches/**"] }
}
```

- [ ] **Step 4: Create `packages/shared`**

Files: `packages/shared/package.json`, `packages/shared/tsconfig.json`, `packages/shared/src/index.ts`.

```json
// packages/shared/package.json
{
  "name": "@riskrask/shared",
  "version": "0.1.0",
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": { "typecheck": "tsc --noEmit", "test": "bun test" },
  "dependencies": { "zod": "^3.23.0" }
}
```

```json
// packages/shared/tsconfig.json
{ "extends": "../../tsconfig.base.json", "include": ["src"] }
```

```ts
// packages/shared/src/index.ts
export const SAVE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export const SAVE_CODE_RE = /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/;
export const ROOM_CODE_RE = /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/;
export const CURRENT_SCHEMA_VERSION = 1 as const;
```

- [ ] **Step 5: Create `packages/engine` stub**

```json
// packages/engine/package.json
{
  "name": "@riskrask/engine",
  "version": "0.1.0",
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": { "typecheck": "tsc --noEmit", "test": "bun test" },
  "dependencies": { "@riskrask/shared": "workspace:*" }
}
```

```ts
// packages/engine/src/index.ts
export const ENGINE_SENTINEL = 'riskrask-engine' as const;
```

- [ ] **Step 6: Create `packages/ai` stub**

```json
// packages/ai/package.json
{
  "name": "@riskrask/ai",
  "version": "0.1.0",
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": { "typecheck": "tsc --noEmit", "test": "bun test" },
  "dependencies": { "@riskrask/shared": "workspace:*", "@riskrask/engine": "workspace:*" }
}
```

```ts
// packages/ai/src/index.ts
export const AI_SENTINEL = 'riskrask-ai' as const;
```

- [ ] **Step 7: Create `apps/web` (Vite + React + TS)**

```json
// apps/web/package.json
{
  "name": "@riskrask/web",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@riskrask/engine": "workspace:*",
    "@riskrask/ai": "workspace:*",
    "@riskrask/shared": "workspace:*",
    "@supabase/supabase-js": "^2.45.0",
    "@tanstack/react-query": "^5.59.0",
    "framer-motion": "^11.11.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "react-router-dom": "^6.27.0",
    "react-zoom-pan-pinch": "^3.6.0",
    "zustand": "^4.5.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@testing-library/react": "^16.0.0",
    "@testing-library/jest-dom": "^6.6.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "autoprefixer": "^10.4.0",
    "jsdom": "^25.0.0",
    "postcss": "^8.4.0",
    "tailwindcss": "^3.4.0",
    "vite": "^5.4.0",
    "vitest": "^2.1.0"
  }
}
```

```ts
// apps/web/vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  test: { environment: 'jsdom', setupFiles: ['src/test/setup.ts'] },
});
```

```html
<!-- apps/web/index.html -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=yes, viewport-fit=cover" />
  <title>RISK — Cold War Edition</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@700&display=swap" rel="stylesheet" />
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
</html>
```

```tsx
// apps/web/src/main.tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './theme/tokens.css';
import './theme/index.css';
const root = document.getElementById('root');
if (!root) throw new Error('root missing');
createRoot(root).render(<StrictMode><div>riskrask boot</div></StrictMode>);
```

```css
/* apps/web/src/theme/tokens.css */
:root {
  --bg-0: #0a1628;
  --bg-1: #142440;
  --panel-bg: rgba(10, 22, 40, 0.92);
  --panel-border: rgba(217, 119, 6, 0.3);
  --amber: #d97706;
  --amber-2: #f59e0b;
  --crimson: #dc2626;
  --sapphire: #2563eb;
  --emerald: #059669;
  --violet: #7c3aed;
  --rose: #ec4899;
  --neutral: #475569;
  --text-1: #e5e7eb;
  --text-2: #94a3b8;
  --text-3: #64748b;
  --font-serif: 'Cormorant Garamond', Georgia, serif;
  --font-sans: 'Inter', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, monospace;
}
```

```css
/* apps/web/src/theme/index.css */
@tailwind base;
@tailwind components;
@tailwind utilities;
html, body { background: radial-gradient(ellipse at center, var(--bg-1) 0%, var(--bg-0) 70%); color: var(--text-1); font-family: var(--font-sans); }
```

```js
// apps/web/tailwind.config.js
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        amber: 'var(--amber)',
        'amber-2': 'var(--amber-2)',
        crimson: 'var(--crimson)',
        sapphire: 'var(--sapphire)',
        emerald: 'var(--emerald)',
        violet: 'var(--violet)',
        rose: 'var(--rose)',
        neutral: 'var(--neutral)',
      },
      fontFamily: {
        serif: ['Cormorant Garamond', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
    },
  },
};
```

```js
// apps/web/postcss.config.js
export default { plugins: { tailwindcss: {}, autoprefixer: {} } };
```

```json
// apps/web/tsconfig.json
{ "extends": "../../tsconfig.base.json", "include": ["src", "vite.config.ts"] }
```

- [ ] **Step 8: Create `apps/admin` (same Vite+React shape, placeholder dashboard)**

Mirror of `apps/web` with a different `index.html` title, no zustand/game deps, and a placeholder dashboard page. `package.json` similar but trimmed. Tests stubbed.

- [ ] **Step 9: Create `apps/server` (Bun + Hono)**

```json
// apps/server/package.json
{
  "name": "@riskrask/server",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "bun --watch src/index.ts",
    "build": "bun build src/index.ts --target bun --outdir dist",
    "typecheck": "tsc --noEmit",
    "test": "bun test"
  },
  "dependencies": {
    "@riskrask/engine": "workspace:*",
    "@riskrask/ai": "workspace:*",
    "@riskrask/shared": "workspace:*",
    "@supabase/supabase-js": "^2.45.0",
    "hono": "^4.6.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/bun": "latest"
  }
}
```

```ts
// apps/server/src/index.ts
import { Hono } from 'hono';
const app = new Hono();
app.get('/health', (c) => c.json({ ok: true, service: 'riskrask-server' }));
const port = Number(process.env.PORT ?? 8787);
export default { port, fetch: app.fetch };
```

- [ ] **Step 10: Add `supabase/config.toml` and empty migrations dir**

```toml
# supabase/config.toml
project_id = "riskrask"
[api]
port = 54321
[db]
port = 54322
[realtime]
enabled = true
[auth]
site_url = "http://localhost:5173"
```

- [ ] **Step 11: Add `.github/workflows/ci.yml`**

```yaml
name: ci
on: [push, pull_request]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bun run lint
      - run: bun run typecheck
      - run: bun run test
      - run: bun run build
```

- [ ] **Step 12: Archive v2 file**

```bash
mkdir -p archive
git mv riskindex-v2-mobile.html archive/riskindex-v2-mobile.html
```

- [ ] **Step 13: Add root `.gitignore`**

```
node_modules/
dist/
.DS_Store
.env
.env.local
*.log
.turbo/
.cache/
apps/*/dist/
packages/*/dist/
supabase/.branches/
supabase/.temp/
.claude/worktrees/
```

- [ ] **Step 14: Install and verify**

```bash
bun install
bun run typecheck
bun run lint
```

Expected: `typecheck` passes with zero errors across every workspace; `lint` reports only informational notices.

- [ ] **Step 15: Commit Phase 0**

```bash
git add -A
git commit -m "scaffold: bun monorepo for riskrask v3

apps/{web,admin,server} + packages/{engine,ai,shared} + supabase/ + infra/cloudflare/.
v2 single-HTML file moved to archive/ for reference.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

## Phase 1 — Parallel tracks

Each track gets its own git worktree and its own plan file. After each track's subagent reports done, its worktree is merged into `main` via PR (or direct merge in autonomous mode).

See:
- `2026-04-19-track-b-engine.md`
- `2026-04-19-track-c-ai.md`
- `2026-04-19-track-d-web.md`
- `2026-04-19-track-e-server.md`

## Phase 2 — Multiplayer

After Phase 1 tracks merge, cut `track-f` worktree:
- `2026-04-19-track-f-multiplayer.md`

## Phase 3 — Admin + replay

- `2026-04-19-track-g-admin.md`
- `2026-04-19-track-h-replay.md`
