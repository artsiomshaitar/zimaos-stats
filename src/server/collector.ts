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

function insertSystemSample(
  ts: number,
  sys: Awaited<ReturnType<MetricsSource["sampleSystem"]>>
) {
  getDb()
    .prepare(
      "INSERT INTO system_samples (ts, cpu_pct, mem_used, mem_total, temp_c, power_w) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .run(ts, sys.cpuPct, sys.memUsed, sys.memTotal, sys.tempC, sys.powerW)
}

function insertContainerSamples(
  ts: number,
  containers: Awaited<ReturnType<MetricsSource["sampleContainers"]>>
) {
  if (containers.length === 0) return
  const db = getDb()
  const insertContainer = db.prepare(
    "INSERT INTO container_samples (ts, container_id, cpu_pct, mem_used) VALUES (?, ?, ?, ?)"
  )
  const upsertContainer = db.prepare(
    `INSERT INTO containers (id, name, icon, last_seen) VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, icon = excluded.icon, last_seen = excluded.last_seen`
  )
  db.exec("BEGIN")
  try {
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
    insertSystemSample(ts, demoSystemAt(ts))
    insertContainerSamples(ts, demoContainersAt(ts))
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

  // System metrics are a handful of /proc//sys reads — cheap enough to run
  // tight. Docker stats are an HTTP call per container, so they get their own
  // slower cadence.
  const systemTick = async () => {
    try {
      insertSystemSample(
        Math.floor(Date.now() / 1000),
        await source.sampleSystem()
      )
    } catch (e) {
      console.error("[collector] system sample failed:", e)
    }
  }
  const containerTick = async () => {
    try {
      insertContainerSamples(
        Math.floor(Date.now() / 1000),
        await source.sampleContainers()
      )
    } catch (e) {
      console.error("[collector] container sample failed:", e)
    }
  }

  void systemTick() // prime CPU counters; first delta lands on the next tick
  void containerTick()
  setInterval(systemTick, config.pollIntervalSeconds * 1000).unref()
  setInterval(containerTick, config.containerPollIntervalSeconds * 1000).unref()
  setInterval(prune, 3600 * 1000).unref()

  console.log(
    `[collector] started (mode=${mode}, system every ${config.pollIntervalSeconds}s, apps every ${config.containerPollIntervalSeconds}s, keeping ${config.historyDays}d, db=${config.dbPath})`
  )
}
