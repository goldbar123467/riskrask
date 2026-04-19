# Riskrask

Cold War Edition Risk — TypeScript monorepo.

## Structure

```
apps/
  web/        Vite + React player client
  admin/      Vite + React admin dashboard (gated by Cloudflare Access)
  server/     Bun + Hono game server (authoritative state)
packages/
  engine/     Pure TS game engine (no I/O, deterministic, seedable RNG)
  ai/         AI personality system (Arch, Persona, Voice, Rep, ...)
  shared/     Shared zod schemas, types, constants
supabase/     Migrations + edge functions
infra/cloudflare/   Workers (rate-limit, save-redirect) + Access config
docs/superpowers/   Design spec + implementation plans
archive/      v2 single-HTML file (frozen reference)
```

## Getting started

```sh
bun install
bun run typecheck     # all workspaces
bun run lint
bun run test

# Dev servers
bun run dev:server    # Bun + Hono on :8787
bun run dev:web       # Vite on :5173
bun run dev:admin     # Vite on :5174
```

## Design

- Spec: [docs/superpowers/specs/2026-04-19-riskrask-v3-design.md](docs/superpowers/specs/2026-04-19-riskrask-v3-design.md)
- Master plan: [docs/superpowers/plans/2026-04-19-riskrask-v3-master.md](docs/superpowers/plans/2026-04-19-riskrask-v3-master.md)
