import { useCallback, useEffect, useRef, useState } from "react"
import { createFileRoute } from "@tanstack/react-router"

import { AppsPanel } from "@/components/apps-panel"
import { MetricCard } from "@/components/metric-card"
import { PulseStrip } from "@/components/pulse-strip"
import { Badge } from "@/components/ui/badge"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  fetchContainerHistory,
  fetchSummary,
  fetchSystemHistory,
} from "@/lib/api"
import {
  formatAgo,
  formatBytes,
  formatBytesAxis,
  formatPct,
  formatTemp,
  formatWatts,
} from "@/lib/format"
import { DEFAULT_RANGE_KEY, RANGES, rangeByKey } from "@/lib/ranges"
import type { ContainerSeries, Summary, SystemPoint } from "@/server/queries"

interface Snapshot {
  now: number
  summary: Summary
  system: Array<SystemPoint>
  containers: Array<ContainerSeries>
  pulse: Array<SystemPoint>
}

async function loadSnapshot(rangeKey: string): Promise<Snapshot> {
  const now = Math.floor(Date.now() / 1000)
  const range = rangeByKey(rangeKey)
  const summary = await fetchSummary()
  const retentionFrom = now - summary.historyDays * 86400
  const [system, containers, pulse] = await Promise.all([
    fetchSystemHistory({ data: { fromSec: now - range.seconds, toSec: now } }),
    fetchContainerHistory({
      data: { fromSec: now - range.seconds, toSec: now },
    }),
    fetchSystemHistory({ data: { fromSec: retentionFrom, toSec: now } }),
  ])
  return { now, summary, system, containers, pulse }
}

export const Route = createFileRoute("/")({
  loader: () => loadSnapshot(DEFAULT_RANGE_KEY),
  component: Dashboard,
})

const REFRESH_MS = 30_000

function Dashboard() {
  const initial = Route.useLoaderData()
  const [rangeKey, setRangeKey] = useState(DEFAULT_RANGE_KEY)
  const [snap, setSnap] = useState<Snapshot>(initial)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [, forceTick] = useState(0)
  const rangeRef = useRef(rangeKey)

  const refresh = useCallback(async (key: string, showStale: boolean) => {
    if (showStale) setIsRefreshing(true)
    try {
      const next = await loadSnapshot(key)
      if (rangeRef.current === key) setSnap(next)
    } catch (e) {
      console.error("refresh failed:", e)
    } finally {
      setIsRefreshing(false)
    }
  }, [])

  useEffect(() => {
    const changedRange = rangeRef.current !== rangeKey
    rangeRef.current = rangeKey
    if (changedRange) void refresh(rangeKey, true)
    const poll = setInterval(
      () => void refresh(rangeRef.current, false),
      REFRESH_MS
    )
    const clock = setInterval(() => forceTick((n) => n + 1), 5000)
    return () => {
      clearInterval(poll)
      clearInterval(clock)
    }
  }, [rangeKey, refresh])

  const range = rangeByKey(rangeKey)
  const toSec = snap.now
  const fromSec = toSec - range.seconds
  const { summary, system, containers, pulse } = snap
  const latest = summary.latest
  const secondsSinceSample = latest
    ? Math.floor(Date.now() / 1000) - latest.ts
    : null
  const stale =
    secondsSinceSample !== null &&
    secondsSinceSample > summary.pollIntervalSeconds * 4

  const pick = (key: keyof SystemPoint) =>
    system.map((p) => ({ ts: p.ts, value: p[key] }))

  return (
    <main className="mx-auto flex min-h-svh max-w-5xl flex-col gap-3 px-4 py-5 md:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-2 w-2" aria-hidden>
            <span
              className={`absolute inline-flex h-full w-full rounded-full ${stale ? "bg-muted-foreground" : "animate-ping bg-primary/60"}`}
              style={{ animationDuration: "2.5s" }}
            />
            <span
              className={`relative inline-flex h-2 w-2 rounded-full ${stale ? "bg-muted-foreground" : "bg-primary"}`}
            />
          </span>
          <h1 className="text-sm font-semibold tracking-tight text-foreground">
            zimaos-stats
          </h1>
          {summary.mode === "demo" && (
            <Badge variant="secondary" className="text-[10px]">
              demo data
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-muted-foreground">
            {secondsSinceSample === null
              ? "no samples yet"
              : stale
                ? `last sample ${formatAgo(secondsSinceSample)}`
                : `updated ${formatAgo(secondsSinceSample)}`}
          </span>
          <ToggleGroup
            value={[rangeKey]}
            onValueChange={(vals: Array<unknown>) => {
              const v = vals[0]
              if (typeof v === "string") setRangeKey(v)
            }}
            variant="outline"
            spacing={0}
            aria-label="Time range"
          >
            {RANGES.map((r) => (
              <ToggleGroupItem
                key={r.key}
                value={r.key}
                className="h-7 px-2.5 text-[11px] data-pressed:bg-primary/15 data-pressed:text-primary"
                aria-label={`Last ${r.label}`}
              >
                {r.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </header>

      <PulseStrip
        points={pulse}
        retentionFrom={toSec - summary.historyDays * 86400}
        now={toSec}
        selectedFrom={fromSec}
        historyDays={summary.historyDays}
      />

      <section
        className="grid grid-cols-1 gap-3 md:grid-cols-2"
        aria-label="System metrics"
      >
        <MetricCard
          title="CPU"
          colorVar="--chart-cpu"
          currentValue={formatPct(
            latest?.cpuPct,
            latest?.cpuPct != null && latest.cpuPct < 10 ? 1 : 0
          )}
          points={pick("cpuPct")}
          fromSec={fromSec}
          toSec={toSec}
          formatValue={(v) => formatPct(v, 1)}
          formatAxis={(v) => formatPct(v)}
          yMax={100}
          isRefreshing={isRefreshing}
        />
        <MetricCard
          title="RAM"
          colorVar="--chart-ram"
          currentValue={formatBytes(latest?.memUsed)}
          currentSub={
            latest?.memTotal ? `of ${formatBytes(latest.memTotal)}` : undefined
          }
          points={pick("memUsed")}
          fromSec={fromSec}
          toSec={toSec}
          formatValue={formatBytes}
          formatAxis={formatBytesAxis}
          yMax={latest?.memTotal ?? undefined}
          isRefreshing={isRefreshing}
        />
        <MetricCard
          title="Temperature"
          colorVar="--chart-temp"
          currentValue={formatTemp(latest?.tempC)}
          points={pick("tempC")}
          fromSec={fromSec}
          toSec={toSec}
          formatValue={formatTemp}
          formatAxis={(v) => `${Math.round(v)}°`}
          yMinAuto
          emptyHint="No temperature sensor found on this device."
          isRefreshing={isRefreshing}
        />
        <MetricCard
          title="Power"
          colorVar="--chart-power"
          currentValue={formatWatts(latest?.powerW)}
          points={pick("powerW")}
          fromSec={fromSec}
          toSec={toSec}
          formatValue={formatWatts}
          formatAxis={(v) => `${Math.round(v)} W`}
          emptyHint="Docker hides power sensors by default — add a volume from /sys/devices/virtual/powercap to /powercap and restart."
          isRefreshing={isRefreshing}
        />
      </section>

      <AppsPanel
        series={containers}
        fromSec={fromSec}
        toSec={toSec}
        isRefreshing={isRefreshing}
      />

      <footer className="pb-2 text-center text-[10px] text-muted-foreground">
        sampling every {summary.pollIntervalSeconds}s · keeping{" "}
        {summary.historyDays} days · {summary.mode} mode
      </footer>
    </main>
  )
}
