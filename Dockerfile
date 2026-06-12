# syntax=docker/dockerfile:1

# ── deps ─────────────────────────────────────────────────────────────
# Install with Bun (fast). node_modules is a standard, Node-resolvable
# tree, so the later Node stages reuse it as-is. The cache mount keeps
# Bun's global package cache warm across builds.
FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile

# ── builder ──────────────────────────────────────────────────────────
# Next.js 16 build runs on Node (the officially supported runtime), not
# Bun. The .next/cache mount makes incremental rebuilds fast.
FROM node:20-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN --mount=type=cache,target=/app/.next/cache \
    node node_modules/next/dist/bin/next build

# ── runner ───────────────────────────────────────────────────────────
# Minimal image: just the standalone server bundle + static assets.
FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 --ingroup nodejs nextjs
# Next's standalone output already contains a pruned node_modules + server.js.
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
