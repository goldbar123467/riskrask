# Track G — Admin Panel Plan

> **For agentic workers:** Use superpowers:executing-plans.

**Goal:** Admin dashboard at `admin.upsidedownatlas.com` gated by Cloudflare Access. Read-only over most data + targeted write actions (ban/unban, rename, force-end-room).

**Worktree:** `.claude/worktrees/track-g-admin`.

---

## File structure

| File | Purpose |
|---|---|
| `apps/admin/src/routes/Dashboard.tsx` | Live metrics |
| `apps/admin/src/routes/Rooms.tsx` | List + filters |
| `apps/admin/src/routes/Room.tsx` | Per-room board + logs + end-room |
| `apps/admin/src/routes/Users.tsx` | Search, ban, rename |
| `apps/admin/src/routes/Balance.tsx` | Personality win rates, length histogram |
| `apps/admin/src/routes/Audit.tsx` | Admin action log |
| `apps/server/src/http/admin.ts` | `/admin/*` routes, CF Access JWT verification |
| `apps/server/src/admin/metrics.ts` | SQL queries |
| `apps/server/src/auth/cfAccess.ts` | Verify `Cf-Access-Jwt-Assertion` |
| `infra/cloudflare/access.md` | Manual config notes (teams dashboard, application rules) |

## Tasks

### Task 1: CF Access JWT verify

- [ ] Fetch JWKS from `https://<team>.cloudflareaccess.com/cdn-cgi/access/certs`, cache 1h.
- [ ] Verify `Cf-Access-Jwt-Assertion` on every `/admin/*` request.
- [ ] Tests with a fixture JWKS.

### Task 2: Admin metrics endpoints

- [ ] `GET /admin/metrics` returns `{ concurrentPlayers, activeRooms, avgTurnTimeMs24h, disconnectRate24h, aiFallbackRate24h }`.
- [ ] `GET /admin/rooms`, `GET /admin/rooms/:id`, `POST /admin/rooms/:id/force-end`.
- [ ] `GET /admin/users?q=`, `POST /admin/users/:id/ban`, `POST /admin/users/:id/unban`, `POST /admin/users/:id/rename`.
- [ ] `GET /admin/balance` returns aggregates.
- [ ] `GET /admin/audit`.

### Task 3: Admin UI pages

- [ ] Tailwind-based layout with left nav.
- [ ] Live dashboard auto-refreshes every 5s (TanStack Query + `refetchInterval`).
- [ ] Room detail renders the same SVG map component from `apps/web` (extracted into `packages/shared-ui` in this track if not already — note: may need a new package).
- [ ] Ban/unban modals with confirmation + reason field (stored in `admin_actions`).

### Task 4: Audit trail

- [ ] Every write goes through a helper that inserts `admin_actions` with `{ admin_id, action, target }`.
- [ ] `Audit.tsx` is a simple reverse-chron table.

### Task 5: Cloudflare Access config

- [ ] Document in `infra/cloudflare/access.md`: create Zero Trust application for `admin.upsidedownatlas.com`, add rules for the admin email list, set JWT audience tag, record audience tag in server env.

### Task 6: Commit

```
admin: dashboard + room/user/balance/audit views behind CF Access

- Server verifies Cf-Access-Jwt-Assertion
- Live dashboard, room detail, user mgmt, balance telemetry, audit log
- Every admin write produces an admin_actions row

Ref: docs/superpowers/specs/2026-04-19-riskrask-v3-design.md §11
```
