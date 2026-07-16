# --- build ---
FROM oven/bun:1.3-slim AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

# --- production dependencies only ---
FROM oven/bun:1.3-slim AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# --- runtime (Bun: bun:sqlite is built in, no native modules; host metrics
#     come from bind-mounted /proc + /sys) ---
FROM oven/bun:1.3-slim
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    DB_PATH=/data/zimaos-stats.db \
    HISTORY_DAYS=7 \
    POLL_INTERVAL_SECONDS=2 \
    CONTAINER_POLL_INTERVAL_SECONDS=15

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json serve.mjs ./
COPY drizzle ./drizzle

VOLUME /data
EXPOSE 3000

HEALTHCHECK --interval=60s --timeout=5s --start-period=15s \
  CMD bun -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["bun", "serve.mjs"]
