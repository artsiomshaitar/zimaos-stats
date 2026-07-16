import defaultEntry from "@tanstack/react-start/server-entry"

// In SPA mode this entry only exists to satisfy the build (it produces an
// unused server bundle). The real runtime server is serve.ts, which starts the
// collector and serves the shell + /api. Keeping the collector OUT of here lets
// the build's shell prerender run without loading bun:sqlite.
export default defaultEntry
