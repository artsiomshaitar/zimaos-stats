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

# --- runtime (node has built-in sqlite; the collector reads host /proc + /sys) ---
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    DB_PATH=/data/zimaos-stats.db \
    HISTORY_DAYS=7 \
    POLL_INTERVAL_SECONDS=15 \
    NODE_OPTIONS=--no-warnings

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json serve.mjs ./

VOLUME /data
EXPOSE 3000

HEALTHCHECK --interval=60s --timeout=5s --start-period=15s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "serve.mjs"]
