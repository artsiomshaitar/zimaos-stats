# The client bundle (dist/) is built beforehand with `bun run build` — on the
# runner/host, not in this image — because the SPA shell prerender needs a
# loopback server that BuildKit's sandbox blocks. dist is pure JS/HTML and
# there are no native modules, so nothing here is architecture-specific beyond
# the Bun base image itself.

# --- production dependencies only ---
FROM oven/bun:1.3-slim AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# --- runtime (Bun runs serve.ts directly: collector + /api + static shell.
#     No React/SSR is loaded, so the footprint stays small. --smol caps the heap.) ---
FROM oven/bun:1.3-slim
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    DB_PATH=/data/zimaos-stats.db \
    HISTORY_DAYS=7 \
    POLL_INTERVAL_SECONDS=2 \
    CONTAINER_POLL_INTERVAL_SECONDS=15

COPY --from=deps /app/node_modules ./node_modules
COPY dist/client ./dist/client
COPY drizzle ./drizzle
COPY src/server ./src/server
COPY serve.ts package.json tsconfig.json ./

VOLUME /data
EXPOSE 3000

HEALTHCHECK --interval=60s --timeout=5s --start-period=15s \
  CMD bun -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["bun", "--smol", "serve.ts"]
