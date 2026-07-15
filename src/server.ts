import defaultEntry from "@tanstack/react-start/server-entry"

import { ensureCollectorStarted } from "./server/collector"

// The collector must run from process boot, not first page view — this app's
// whole job is recording history while nobody is looking at it.
ensureCollectorStarted()

export default defaultEntry
