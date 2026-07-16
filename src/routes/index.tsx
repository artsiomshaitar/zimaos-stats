import { createFileRoute } from "@tanstack/react-router"

import { DEFAULT_RANGE_KEY } from "@/lib/ranges"
import { loadSnapshot } from "./-snapshot"

// Loader only. The heavy dashboard component (React charts) lives in the
// client-only lazy route (index.lazy.tsx) so its code never enters the server
// bundle — the server just prerenders/serves a shell and answers data calls.
export const Route = createFileRoute("/")({
  loader: () => loadSnapshot(DEFAULT_RANGE_KEY),
})
