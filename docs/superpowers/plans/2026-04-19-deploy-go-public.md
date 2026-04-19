# Deploy → Go-Public Plan

> **Scope:** Everything from "Tracks B/C/D/E merged on main" to "upsidedownatlas.com is publicly playable behind Cloudflare with Zero Trust on `admin.upsidedownatlas.com`."

**Goal:** Bring v3 from a green local monorepo to a live public site without surprises.

**Two hosts in play:**
- **`159.69.91.90`** (Hetzner VPS, user `clark`, key auth) — runs the **Bun + Hono game server** (HTTP + WebSocket origin). This replaces the design doc's Fly.io plan; the user has this box, prefer it.
- **Cloudflare** — DNS, Pages (web + admin static bundles), Workers (rate-limit, save-redirect), Access (Zero Trust on admin), Turnstile.
- **Supabase** — managed Postgres + Auth + Realtime + Edge Functions. Two projects: `riskrask-staging`, `riskrask-prod`.

---

## Pre-deploy gate (must be true before Phase 0)

- [ ] Phase 1 tracks merged on `main`: A (scaffold), B (engine), C (AI), D (web UI), E (server + Supabase + saves).
- [ ] `bun run typecheck` / `lint` / `test` / `build` green at HEAD.
- [ ] Final visual smoke of `bun run dev:web` against the Command Console mockup.

## Phase 0 — Code housekeeping

- [ ] **0.1** Create `.env.example` files at repo root, `apps/server/`, `apps/web/`, `apps/admin/`. Document every env var the apps read (`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_ANON_KEY`, `JWT_AUDIENCE`, `ALLOWED_ORIGINS`, `TURNSTILE_SECRET`, `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD`, `PORT`, `GIT_SHA`).
- [ ] **0.2** Add `apps/server/Dockerfile` (multi-stage Bun build → minimal runtime image). Health-check on `/health`.
- [ ] **0.3** Add `apps/server/docker-compose.yml` for the Hetzner deploy (server + Caddy reverse proxy + `restart: unless-stopped`).
- [ ] **0.4** Add a GitHub remote (`git remote add origin git@github.com:<user>/riskrask.git`) — confirm the URL with the user before pushing.
- [ ] **0.5** Push `main`. Verify GitHub Actions CI is green on the first push.
- [ ] **0.6** Tag `v3.0.0-rc1`.

## Phase 1 — Hetzner box prep (`159.69.91.90`, user `clark`)

> All commands assume `ssh clark@159.69.91.90`. fail2ban is on; don't iterate ssh attempts faster than ~1/min.

- [ ] **1.1** OS update: `sudo apt-get update && sudo apt-get -y upgrade && sudo apt-get -y install build-essential curl git ufw fail2ban unattended-upgrades`.
- [ ] **1.2** Verify (or install) **Docker + Docker Compose plugin** from the official convenience script: `curl -fsSL https://get.docker.com | sudo sh && sudo usermod -aG docker clark && newgrp docker`.
- [ ] **1.3** Install **Bun** under the `clark` account (only used for one-off scripts; the server itself runs in Docker): `curl -fsSL https://bun.sh/install | bash`.
- [ ] **1.4** Configure **UFW**: deny incoming by default, allow `ssh` (limit), allow `80,443`, allow `8787` only from Cloudflare ranges (deny otherwise — the WebSocket origin is fronted by CF). Script in `infra/hetzner/ufw.sh`.
- [ ] **1.5** Tighten **sshd**: disable password auth, disable root login, keep ed25519 keys only. Script in `infra/hetzner/sshd-hardening.sh`.
- [ ] **1.6** Install **Caddy** as a static binary (Cloudflare DNS-01 plugin baked in for automatic TLS).
- [ ] **1.7** Create a `riskrask` system group and a `~/riskrask/` deploy directory owned by `clark:riskrask`.
- [ ] **1.8** Create `~/.config/riskrask/.env.prod` with the secrets (mode `600`). Document every key in `infra/hetzner/env.example`.
- [ ] **1.9** Reboot, verify all services come back, take a snapshot in Hetzner cloud panel.

## Phase 2 — Supabase projects

- [ ] **2.1** Create `riskrask-staging` Supabase project. Link locally: `supabase link --project-ref <staging-ref>`.
- [ ] **2.2** Run migrations: `supabase db push` (applies `supabase/migrations/0001..0004`).
- [ ] **2.3** Deploy edge functions: `supabase functions deploy create-save load-save generate-room-code`.
- [ ] **2.4** Capture: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY` for staging. Drop into `~/.config/riskrask/.env.staging` on the box; mirror into Cloudflare Pages env (later).
- [ ] **2.5** Repeat 2.1–2.4 for `riskrask-prod`.
- [ ] **2.6** Verify: `psql "$SUPABASE_URL" -c "select count(*) from saves;"` returns 0 against both.

## Phase 3 — DNS + Cloudflare

- [ ] **3.1** Confirm domain is `upsidedownatlas.com` (or substitute) and lives in the user's Cloudflare account.
- [ ] **3.2** A record: `api.upsidedownatlas.com` → `159.69.91.90` (proxied / orange cloud ON).
- [ ] **3.3** CNAME: `www.upsidedownatlas.com` → Pages project (set in Phase 5).
- [ ] **3.4** CNAME: `admin.upsidedownatlas.com` → Pages project (set in Phase 5; Access policy added in Phase 7).
- [ ] **3.5** SSL/TLS mode: **Full (strict)**.
- [ ] **3.6** Origin certificate: generate a CF Origin cert for `*.upsidedownatlas.com`, install on the box for Caddy (Caddy's CF DNS-01 path also works — pick one). Document choice in `infra/hetzner/tls.md`.

## Phase 4 — Deploy game server to Hetzner

- [ ] **4.1** From the box: `git clone git@github.com:<user>/riskrask.git ~/riskrask` (or use the URL from 0.4).
- [ ] **4.2** `cd ~/riskrask && cp ~/.config/riskrask/.env.prod apps/server/.env`.
- [ ] **4.3** `docker compose -f apps/server/docker-compose.yml up -d --build`. Tail logs: `docker compose logs -f server`.
- [ ] **4.4** Caddyfile: reverse-proxy `api.upsidedownatlas.com → http://127.0.0.1:8787` (HTTP and WebSocket upgrade). Health-check probe `/health`.
- [ ] **4.5** Smoke: `curl https://api.upsidedownatlas.com/health` → `{ "ok": true, ... }`.
- [ ] **4.6** Smoke WebSocket: `wscat -c wss://api.upsidedownatlas.com/ws/echo` (add a minimal echo route if needed for this test).
- [ ] **4.7** Add `systemd` unit for `docker compose up -d` so the stack survives reboot. Or use `restart: unless-stopped` and rely on Docker's own restart loop.

## Phase 5 — Cloudflare Pages (web + admin)

- [ ] **5.1** Pages project `riskrask-web`: connect repo, build command `bun run --filter='@riskrask/web' build`, output dir `apps/web/dist`, env vars (`VITE_API_URL=https://api.upsidedownatlas.com`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_TURNSTILE_SITE_KEY`).
- [ ] **5.2** Pages project `riskrask-admin`: same shape, output `apps/admin/dist`, env (`VITE_API_URL=https://api.upsidedownatlas.com`).
- [ ] **5.3** Wait for first build to succeed.
- [ ] **5.4** Bind custom domains: `www.upsidedownatlas.com → riskrask-web`, `admin.upsidedownatlas.com → riskrask-admin`.
- [ ] **5.5** Add a redirect `upsidedownatlas.com → www.upsidedownatlas.com` (Cloudflare bulk redirect or page rule).
- [ ] **5.6** Smoke: open `https://www.upsidedownatlas.com`, verify Console renders + connects to `api.upsidedownatlas.com`.

## Phase 6 — Cloudflare Workers

- [ ] **6.1** `infra/cloudflare/workers/rate-limit/` — Worker that throttles `POST /api/auth/signup`, `POST /api/rooms`, and reconnect attempts per-IP. Backed by KV. Deploy via wrangler.
- [ ] **6.2** `infra/cloudflare/workers/save-redirect/` — Worker on `upsidedownatlas.com/r/:code` that 302s to `https://www.upsidedownatlas.com/?save=:code`. Deploy.
- [ ] **6.3** Bind workers to routes in Cloudflare dashboard.

## Phase 7 — Cloudflare Access (Zero Trust) — the final gate

- [ ] **7.1** In Cloudflare Zero Trust dashboard, create an **Access Application**:
  - Type: **Self-hosted**
  - Application name: `riskrask-admin`
  - Application domain: `admin.upsidedownatlas.com`
  - Identity providers: One-time PIN to a small admin allowlist initially; add Google/GitHub IdP if the user wants.
  - Session duration: 24 hours.
  - Capture the **Application AUD** tag — this is what the server verifies.
- [ ] **7.2** Add a **Policy**:
  - Name: `admin-allowlist`
  - Action: Allow
  - Include: emails in [list]
  - Require: country = US/UK/etc as desired (optional).
- [ ] **7.3** Set `CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD` env vars on the Bun server (Phase 1.8 file). Restart the server.
- [ ] **7.4** Verify the server's `verifyAdminJwt` rejects unsigned requests to `/admin/*`. Verify it accepts a real CF Access JWT against the JWKS.
- [ ] **7.5** Smoke: open `https://admin.upsidedownatlas.com` from an allowed account → land on the dashboard. From a non-allowlist account → blocked at CF.

## Phase 8 — Turnstile + ToS

- [ ] **8.1** Create a Turnstile widget for `*.upsidedownatlas.com`. Capture site key + secret.
- [ ] **8.2** Set `TURNSTILE_SECRET` on the server, `VITE_TURNSTILE_SITE_KEY` on Pages.
- [ ] **8.3** Wire the widget into Signup + room-create forms (lands with Track F's signup work).
- [ ] **8.4** Publish the ToS page (`/legal/tos`) — the short version from the design doc §10.

## Phase 9 — Observability

- [ ] **9.1** Server: structured JSON logs to stdout (already on). Add `docker compose` log rotation: `--log-opt max-size=20m --log-opt max-file=10`.
- [ ] **9.2** Cloudflare Analytics: enable, baseline traffic.
- [ ] **9.3** Supabase: turn on log drains to a place we can grep (or just use the Studio for now).
- [ ] **9.4** Uptime: configure a free uptime monitor (UptimeRobot or BetterStack) on `https://api.upsidedownatlas.com/health` and `https://www.upsidedownatlas.com`.
- [ ] **9.5** Page a single Telegram/email channel on outage; document in `infra/oncall.md`.

## Phase 10 — Public launch

- [ ] **10.1** Final E2E run (Playwright against the live domains).
- [ ] **10.2** Tag `v3.0.0`.
- [ ] **10.3** Lift the temporary "closed beta" banner if any.
- [ ] **10.4** Announce. Watch logs and the rate-limit Worker counters for 24h.

---

## Tracking

This file lives in the repo so the user can tick boxes from a PR or commit. It's intentionally a flat list — not nested phases — so it survives copy-paste into an issue tracker if needed.

Estimated wall-clock once Tracks C/D merge: **half a day** for an attentive operator, **1–2 days** if bouncing between fresh accounts (Cloudflare DNS propagation + Supabase project provisioning are the slow links).
