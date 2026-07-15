import { config } from "./config"
import { getDb } from "./db"
import {
  DemoMetricsSource,
  demoContainersAt,
  demoSystemAt,
} from "./demo-metrics"
import { HostMetricsSource, hostIsReadable } from "./host-metrics"
import type { MetricsSource } from "./types"

declare global {
  var __zimaStatsCollector: { mode: "host" | "demo" } | undefined
}

function resolveSource(): { mode: "host" | "demo"; source: MetricsSource } {
  if (config.mode === "demo")
    return { mode: "demo", source: new DemoMetricsSource() }
  if (config.mode === "host")
    return { mode: "host", source: new HostMetricsSource() }
  return hostIsReadable()
    ? { mode: "host", source: new HostMetricsSource() }
    : { mode: "demo", source: new DemoMetricsSource() }
}

export function collectorMode(): "host" | "demo" {
  return globalThis.__zimaStatsCollector?.mode ?? "host"
}

function insertSample(
  ts: number,
  sys: Awaited<ReturnType<MetricsSource["sampleSystem"]>>,
  containers: Awaited<ReturnType<MetricsSource["sampleContainers"]>>
) {
  const db = getDb()
  const insertSystem = db.prepare(
    "INSERT INTO system_samples (ts, cpu_pct, mem_used, mem_total, temp_c, power_w) VALUES (?, ?, ?, ?, ?, ?)"
  )
  const insertContainer = db.prepare(
    "INSERT INTO container_samples (ts, container_id, cpu_pct, mem_used) VALUES (?, ?, ?, ?)"
  )
  const upsertContainer = db.prepare(
    `INSERT INTO containers (id, name, icon, last_seen) VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, icon = excluded.icon, last_seen = excluded.last_seen`
  )
  db.exec("BEGIN")
  try {
    insertSystem.run(
      ts,
      sys.cpuPct,
      sys.memUsed,
      sys.memTotal,
      sys.tempC,
      sys.powerW
    )
    for (const c of containers) {
      insertContainer.run(ts, c.id, c.cpuPct, c.memUsed)
      upsertContainer.run(c.id, c.name, c.icon, ts)
    }
    db.exec("COMMIT")
  } catch (e) {
    db.exec("ROLLBACK")
    throw e
  }
}

function prune() {
  const db = getDb()
  const cutoff = Math.floor(Date.now() / 1000) - config.historyDays * 86400
  db.prepare("DELETE FROM system_samples WHERE ts < ?").run(cutoff)
  db.prepare("DELETE FROM container_samples WHERE ts < ?").run(cutoff)
  db.prepare("DELETE FROM containers WHERE last_seen < ?").run(cutoff)
}

// In demo mode, seed the full retention window on first boot so charts have
// something to show immediately.
function backfillDemoHistory() {
  const db = getDb()
  const row = db.prepare("SELECT COUNT(*) AS n FROM system_samples").get() as {
    n: number
  }
  if (row.n > 0) return
  const now = Math.floor(Date.now() / 1000)
  const step = Math.max(60, config.pollIntervalSeconds * 4)
  for (let ts = now - config.historyDays * 86400; ts < now; ts += step) {
    insertSample(ts, demoSystemAt(ts), demoContainersAt(ts))
  }
}

export function ensureCollectorStarted() {
  if (globalThis.__zimaStatsCollector) return
  const { mode, source } = resolveSource()
  globalThis.__zimaStatsCollector = { mode }

  if (mode === "demo") {
    console.log("[collector] host metrics unavailable — running with demo data")
    backfillDemoHistory()
  }

  prune()

  const tick = async () => {
    try {
      const ts = Math.floor(Date.now() / 1000)
      const [sys, containers] = await Promise.all([
        source.sampleSystem(),
        source.sampleContainers(),
      ])
      insertSample(ts, sys, containers)
    } catch (e) {
      console.error("[collector] sample failed:", e)
    }
  }

  void tick() // prime CPU counters; first delta lands on the next tick
  const pollTimer = setInterval(tick, config.pollIntervalSeconds * 1000)
  pollTimer.unref()
  const pruneTimer = setInterval(prune, 3600 * 1000)
  pruneTimer.unref()

  console.log(
    `[collector] started (mode=${mode}, every ${config.pollIntervalSeconds}s, keeping ${config.historyDays}d, db=${config.dbPath})`
  )
}
