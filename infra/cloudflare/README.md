# Cloudflare

This directory holds Workers, Pages build configs, and Zero Trust (Access) documentation for the Riskrask deployment.

- `workers/rate-limit/` — signup + room-create + reconnect rate limiter (Track F).
- `workers/save-redirect/` — `riskrask.com/r/:code` → short-link into `/?save=CODE` (Track E/F).
- `access.md` — Zero Trust application config for `admin.riskrask.com` (Track G).

Populated during Tracks E/F/G.
