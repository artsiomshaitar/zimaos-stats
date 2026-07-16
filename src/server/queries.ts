import { and, desc, gte, lte, sql } from "drizzle-orm"

import { collectorMode } from "./collector"
import { config } from "./config"
import { getDb } from "./db"
import { containerSamples, containers, systemSamples } from "./schema"

export interface SystemPoint {
  ts: number
  cpuPct: number | null
  memUsed: number | null
  memTotal: number | null
  tempC: number | null
  powerW: number | null
  netRx: number | null
  netTx: number | null
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
  version: string
  deviceName: string | null
  pollIntervalSeconds: number
  containerPollIntervalSeconds: number
  historyDays: number
  latest: SystemPoint | null
}

// Human-sized aggregation steps. Charts get AVG-per-bucket rows, and the
// bucket snaps to the smallest of these that keeps the range under maxPoints:
// 10m range → 2s buckets, 24h → 5min, 7d → 30min.
const NICE_BUCKETS = [
  2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 14400,
]

function bucketSize(
  fromSec: number,
  toSec: number,
  maxPoints: number,
  floorSec: number
): number {
  const span = Math.max(1, toSec - fromSec)
  const raw = Math.max(floorSec, Math.ceil(span / maxPoints))
  return (
    NICE_BUCKETS.find((b) => b >= raw) ?? NICE_BUCKETS[NICE_BUCKETS.length - 1]
  )
}

export function getSummary(): Summary {
  const latest =
    getDb()
      .select()
      .from(systemSamples)
      .orderBy(desc(systemSamples.ts))
      .limit(1)
      .get() ?? null
  return {
    mode: collectorMode(),
    version: config.version,
    deviceName: config.deviceName,
    pollIntervalSeconds: config.pollIntervalSeconds,
    containerPollIntervalSeconds: config.containerPollIntervalSeconds,
    historyDays: config.historyDays,
    latest,
  }
}

export function getSystemHistory(
  fromSec: number,
  toSec: number,
  maxPoints = 400
): Array<SystemPoint> {
  const bucket = bucketSize(fromSec, toSec, maxPoints, config.pollIntervalSeconds)
  const bucketTs = sql<number>`(${systemSamples.ts} / ${bucket}) * ${bucket}`
  return getDb()
    .select({
      ts: bucketTs,
      cpuPct: sql<number | null>`avg(${systemSamples.cpuPct})`,
      memUsed: sql<number | null>`avg(${systemSamples.memUsed})`,
      memTotal: sql<number | null>`max(${systemSamples.memTotal})`,
      tempC: sql<number | null>`avg(${systemSamples.tempC})`,
      powerW: sql<number | null>`avg(${systemSamples.powerW})`,
      netRx: sql<number | null>`avg(${systemSamples.netRx})`,
      netTx: sql<number | null>`avg(${systemSamples.netTx})`,
    })
    .from(systemSamples)
    .where(and(gte(systemSamples.ts, fromSec), lte(systemSamples.ts, toSec)))
    .groupBy(bucketTs)
    .orderBy(bucketTs)
    .all()
}

export function getContainerHistory(
  fromSec: number,
  toSec: number,
  maxPoints = 200
): Array<ContainerSeries> {
  const db = getDb()
  const bucket = bucketSize(
    fromSec,
    toSec,
    maxPoints,
    config.containerPollIntervalSeconds
  )
  const bucketTs = sql<number>`(${containerSamples.ts} / ${bucket}) * ${bucket}`

  const rows = db
    .select({
      id: containerSamples.containerId,
      ts: bucketTs,
      cpuPct: sql<number | null>`avg(${containerSamples.cpuPct})`,
      memUsed: sql<number | null>`avg(${containerSamples.memUsed})`,
    })
    .from(containerSamples)
    .where(
      and(gte(containerSamples.ts, fromSec), lte(containerSamples.ts, toSec))
    )
    .groupBy(containerSamples.containerId, bucketTs)
    .orderBy(bucketTs)
    .all()

  const meta = new Map(
    db
      .select({
        id: containers.id,
        name: containers.name,
        icon: containers.icon,
      })
      .from(containers)
      .all()
      .map((m) => [m.id, m])
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
