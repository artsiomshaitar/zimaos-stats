import { defineConfig } from "vite"
import type { Plugin } from "vite"
import { devtools } from "@tanstack/devtools-vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

// In dev there is no serve.ts, so mount the same /api handlers on vite's dev
// server (and start the collector) — keeps data working under `bun run dev`.
function devApi(): Plugin {
  return {
    name: "zimaos-dev-api",
    apply: "serve",
    configureServer(server) {
      // Start the collector eagerly so its initial (demo) backfill completes
      // before any request races it.
      void server
        .ssrLoadModule("/src/server/collector.ts")
        .then((m) => m.ensureCollectorStarted())
        .catch((e) => server.config.logger.error(String(e)))

      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url ?? "/", "http://localhost")
        if (!url.pathname.startsWith("/api/")) return next()
        server
          .ssrLoadModule("/src/server/handlers.ts")
          .then(({ handleApi }) => {
            const result = handleApi(url.pathname, url.searchParams)
            if (result.kind === "json") {
              res.setHeader("content-type", "application/json")
              res.end(JSON.stringify(result.data))
            } else {
              res.statusCode = result.kind === "bad-request" ? 400 : 404
              res.end(result.kind)
            }
          })
          .catch((e) => {
            res.statusCode = 500
            res.end(String(e))
          })
      })
    },
  }
}

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  // bun:sqlite is a Bun runtime builtin — never bundle it.
  ssr: { external: ["bun:sqlite"] },
  build: { rollupOptions: { external: [/^bun:/] } },
  plugins: [
    devApi(),
    devtools(),
    tailwindcss(),
    tanstackStart({ spa: { enabled: true } }),
    viteReact(),
  ],
})

export default config
