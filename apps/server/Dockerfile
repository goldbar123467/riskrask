# Multi-stage Bun build for the riskrask game server.
# Build context = repo root (so workspace deps resolve).
#
#   docker build -f apps/server/Dockerfile -t riskrask-server .
#   docker run -p 8787:8787 --env-file ./apps/server/.env riskrask-server

# ----- builder -----
FROM oven/bun:1.3.5 AS builder
WORKDIR /repo

# Copy lockfile + ALL workspace manifests first for cache efficiency.
# Bun resolves workspace deps against every manifest in `workspaces`, so we
# must include even the ones we don't run (web/admin) or `--frozen-lockfile`
# will reject the install with "lockfile had changes".
COPY package.json bun.lock bunfig.toml tsconfig.base.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY apps/admin/package.json apps/admin/
COPY packages/engine/package.json packages/engine/
COPY packages/ai/package.json packages/ai/
COPY packages/shared/package.json packages/shared/

# Install with frozen lockfile
RUN bun install --frozen-lockfile

# Copy server + the packages it actually needs at runtime
COPY apps/server apps/server
COPY packages/engine packages/engine
COPY packages/ai packages/ai
COPY packages/shared packages/shared

# Typecheck the server before producing the image
RUN bun --filter='@riskrask/server' run typecheck

# ----- runtime -----
FROM oven/bun:1.3.5-slim AS runtime
WORKDIR /app

# Pull in node_modules + source we need to run
COPY --from=builder /repo/node_modules ./node_modules
COPY --from=builder /repo/package.json ./
COPY --from=builder /repo/bun.lock ./
COPY --from=builder /repo/tsconfig.base.json ./
COPY --from=builder /repo/apps/server ./apps/server
COPY --from=builder /repo/packages ./packages

ENV PORT=8787
ENV NODE_ENV=production
EXPOSE 8787

# Bun runs TS directly — no pre-build step needed
CMD ["bun", "apps/server/src/index.ts"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:8787/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
