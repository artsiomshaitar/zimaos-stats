// Production entry: static client assets + the TanStack Start fetch handler.
// Run with: node serve.mjs (after `bun run build`)
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { serve } from "srvx"
import { serveStatic } from "srvx/static"

const root = dirname(fileURLToPath(import.meta.url))
const handler = (await import("./dist/server/server.js")).default

const server = serve({
  port: Number(process.env.PORT ?? 3000),
  middleware: [serveStatic({ dir: join(root, "dist", "client") })],
  fetch: (request) => handler.fetch(request),
})

await server.ready()
console.log(`[zimaos-stats] listening on :${server.options.port}`)
