import { collectorMode } from "./collector"
import { config } from "./config"
import { getDb } from "./db"

export interface SystemPoint {
  ts: number
  cpuPct: number | null
  memUsed: number | null
  memTotal: number | null
  tempC: number | null
  powerW: number | null
}

export interface ContainerSeries {
  id: string
  name: string
  icon: string | null
  avgCpuPct: number
  lastCpuPct: number | null
  lastMemUsed: number | null
  points: Array<{ ts: number; cpuPct: number | null; memUsed: number | null }>
}

export interface Summary {
  mode: "host" | "demo"
  pollIntervalSeconds: number
  historyDays: number
  latest: SystemPoint | null
}

function bucketSize(fromSec: number, toSec: number, maxPoints: number): number {
  const span = Math.max(1, toSec - fromSec)
  return Math.max(config.pollIntervalSeconds, Math.ceil(span / maxPoints))
}

export function getSummary(): Summary {
  const db = getDb()
  const latest = db
    .prepare(
      `SELECT ts, cpu_pct AS cpuPct, mem_used AS memUsed, mem_total AS memTotal,
              temp_c AS tempC, power_w AS powerW
       FROM system_samples ORDER BY ts DESC LIMIT 1`
    )
    .get() as SystemPoint | undefined
  return {
    mode: collectorMode(),
    pollIntervalSeconds: config.pollIntervalSeconds,
    historyDays: config.historyDays,
    latest: latest ?? null,
  }
}

export function getSystemHistory(
  fromSec: number,
  toSec: number,
  maxPoints = 400
): Array<SystemPoint> {
  const db = getDb()
  const bucket = bucketSize(fromSec, toSec, maxPoints)
  return db
    .prepare(
      `SELECT (ts / $bucket) * $bucket AS ts,
              AVG(cpu_pct) AS cpuPct,
              AVG(mem_used) AS memUsed,
              MAX(mem_total) AS memTotal,
              AVG(temp_c) AS tempC,
              AVG(power_w) AS powerW
       FROM system_samples
       WHERE ts >= $from AND ts <= $to
       GROUP BY ts / $bucket
       ORDER BY ts`
    )
    .all({
      $bucket: bucket,
      $from: fromSec,
      $to: toSec,
    } as any) as unknown as Array<SystemPoint>
}

export function getContainerHistory(
  fromSec: number,
  toSec: number,
  maxPoints = 200
): Array<ContainerSeries> {
  const db = getDb()
  const bucket = bucketSize(fromSec, toSec, maxPoints)

  const rows = db
    .prepare(
      `SELECT s.container_id AS id,
              (s.ts / $bucket) * $bucket AS ts,
              AVG(s.cpu_pct) AS cpuPct,
              AVG(s.mem_used) AS memUsed
       FROM container_samples s
       WHERE s.ts >= $from AND s.ts <= $to
       GROUP BY s.container_id, s.ts / $bucket
       ORDER BY ts`
    )
    .all({
      $bucket: bucket,
      $from: fromSec,
      $to: toSec,
    } as any) as unknown as Array<{
    id: string
    ts: number
    cpuPct: number | null
    memUsed: number | null
  }>

  const meta = new Map(
    (
      db
        .prepare("SELECT id, name, icon FROM containers")
        .all() as unknown as Array<{
        id: string
        name: string
        icon: string | null
      }>
    ).map((m) => [m.id, m])
  )

  const byId = new Map<string, ContainerSeries>()
  for (const row of rows) {
    let series = byId.get(row.id)
    if (!series) {
      const m = meta.get(row.id)
      series = {
        id: row.id,
        name: m?.name ?? row.id,
        icon: m?.icon ?? null,
        avgCpuPct: 0,
        lastCpuPct: null,
        lastMemUsed: null,
        points: [],
      }
      byId.set(row.id, series)
    }
    series.points.push({ ts: row.ts, cpuPct: row.cpuPct, memUsed: row.memUsed })
  }

  for (const series of byId.values()) {
    const cpuValues = series.points
      .map((p) => p.cpuPct)
      .filter((v) => v !== null)
    series.avgCpuPct = cpuValues.length
      ? cpuValues.reduce((a, b) => a + b, 0) / cpuValues.length
      : 0
    const last = series.points.at(-1)
    series.lastCpuPct = last?.cpuPct ?? null
    series.lastMemUsed = last?.memUsed ?? null
  }

  return [...byId.values()].sort((a, b) => b.avgCpuPct - a.avgCpuPct)
}
