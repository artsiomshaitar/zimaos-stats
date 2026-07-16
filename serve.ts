import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { serve } from "srvx"
import { serveStatic } from "srvx/static"

import { ensureCollectorStarted } from "./src/server/collector"
import { handleApi } from "./src/server/handlers"

// Production server, run with `bun --smol serve.ts`. Deliberately tiny: it
// starts the collector and answers /api data calls straight from Drizzle, and
// serves the prerendered client shell for everything else. It never imports
// React / the SSR runtime, which is what keeps the process footprint small.
ensureCollectorStarted()

const root = dirname(fileURLToPath(import.meta.url))
const clientDir = join(root, "dist", "client")
const shell = readFileSync(join(clientDir, "_shell.html"))

const server = serve({
  port: Number(process.env.PORT ?? 3000),
  middleware: [serveStatic({ dir: clientDir })],
  fetch(request) {
    const url = new URL(request.url)
    if (url.pathname.startsWith("/api/")) {
      const result = handleApi(url.pathname, url.searchParams)
      if (result.kind === "json") return Response.json(result.data)
      if (result.kind === "bad-request")
        return new Response("invalid range", { status: 400 })
      return new Response("not found", { status: 404 })
    }
    // Any non-asset path is a client route → serve the SPA shell.
    return new Response(shell, {
      headers: { "content-type": "text/html; charset=utf-8" },
    })
  },
})

await server.ready()
console.log(`[zimaos-stats] listening on :${server.options.port}`)
