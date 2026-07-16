import { lt, sql } from "drizzle-orm"

import { config } from "./config"
import { getDb } from "./db"
import {
  DemoMetricsSource,
  demoContainersAt,
  demoSystemAt,
} from "./demo-metrics"
import { HostMetricsSource, hostIsReadable } from "./host-metrics"
import { containerSamples, containers, systemSamples } from "./schema"
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
  getDb().insert(systemSamples).values({ ts, ...sys }).run()
}

function insertContainerSamples(
  ts: number,
  samples: Awaited<ReturnType<MetricsSource["sampleContainers"]>>
) {
  if (samples.length === 0) return
  const db = getDb()
  db.transaction((tx) => {
    for (const c of samples) {
      tx.insert(containerSamples)
        .values({ ts, containerId: c.id, cpuPct: c.cpuPct, memUsed: c.memUsed })
        .run()
      tx.insert(containers)
        .values({ id: c.id, name: c.name, icon: c.icon, lastSeen: ts })
        .onConflictDoUpdate({
          target: containers.id,
          set: { name: c.name, icon: c.icon, lastSeen: ts },
        })
        .run()
    }
  })
}

function prune() {
  const db = getDb()
  const cutoff = Math.floor(Date.now() / 1000) - config.historyDays * 86400
  db.delete(systemSamples).where(lt(systemSamples.ts, cutoff)).run()
  db.delete(containerSamples).where(lt(containerSamples.ts, cutoff)).run()
  db.delete(containers).where(lt(containers.lastSeen, cutoff)).run()
}

// In demo mode, seed the full retention window on first boot so charts have
// something to show immediately.
function backfillDemoHistory() {
  const db = getDb()
  const row = db
    .select({ n: sql<number>`count(*)` })
    .from(systemSamples)
    .get()
  if (row && row.n > 0) return
  const now = Math.floor(Date.now() / 1000)
  const step = Math.max(60, config.pollIntervalSeconds * 4)
  // One transaction for the whole window — thousands of individual commits
  // would thrash the WAL for no reason.
  db.transaction(() => {
    for (let ts = now - config.historyDays * 86400; ts < now; ts += step) {
      insertSystemSample(ts, demoSystemAt(ts))
      insertContainerSamples(ts, demoContainersAt(ts))
    }
  })
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
