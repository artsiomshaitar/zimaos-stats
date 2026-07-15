import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createFileRoute } from "@tanstack/react-router"

import { AppsPanel } from "@/components/apps-panel"
import { Logo } from "@/components/logo"
import { MetricCard } from "@/components/metric-card"
import { PulseStrip } from "@/components/pulse-strip"
import { resolveDeviceName } from "@/lib/device"
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
import {
  DEFAULT_RANGE_KEY,
  RANGES,
  rangeByKey,
  refreshMsFor,
} from "@/lib/ranges"
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

const LIVE_SUMMARY_MS = 3_000

const fmtPct1 = (v: number) => formatPct(v, 1)
const fmtPct0 = (v: number) => formatPct(v)
const fmtTempAxis = (v: number) => `${Math.round(v)}°`
const fmtWattsAxis = (v: number) => `${Math.round(v)} W`

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
    const historyMs = refreshMsFor(rangeByKey(rangeKey))
    const poll = setInterval(
      () => void refresh(rangeRef.current, false),
      historyMs
    )
    // Current values update independently of the (possibly slow) history
    // refetch, so the header numbers stay live on long ranges too.
    const live =
      historyMs > LIVE_SUMMARY_MS
        ? setInterval(() => {
            fetchSummary()
              .then((summary) => setSnap((prev) => ({ ...prev, summary })))
              .catch(() => {})
          }, LIVE_SUMMARY_MS)
        : null
    // Only drives the staleness check now (no visible seconds counter).
    const clock = setInterval(() => forceTick((n) => n + 1), 5000)
    return () => {
      clearInterval(poll)
      if (live) clearInterval(live)
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
  // Seconds since the last sample, but only once it's overdue — null while healthy.
  const staleSinceSec =
    secondsSinceSample !== null &&
    secondsSinceSample > Math.max(10, summary.pollIntervalSeconds * 5)
      ? secondsSinceSample
      : null

  const metricPoints = useMemo(() => {
    const pick = (key: keyof SystemPoint) =>
      system.map((p) => ({ ts: p.ts, value: p[key] }))
    return {
      cpu: pick("cpuPct"),
      mem: pick("memUsed"),
      temp: pick("tempC"),
      power: pick("powerW"),
    }
  }, [system])

  // Derived on the client from the connected hostname (or DEVICE_NAME env).
  const [deviceName, setDeviceName] = useState(() =>
    resolveDeviceName(summary.deviceName)
  )
  useEffect(() => {
    setDeviceName(resolveDeviceName(summary.deviceName))
  }, [summary.deviceName])

  // Tab title: "T800 - 3w/40° 5%/2.1gb", tracking the live current values.
  useEffect(() => {
    const parts: Array<string> = []
    if (latest?.powerW != null) parts.push(`${latest.powerW.toFixed(1)}w`)
    if (latest?.tempC != null) parts.push(`${Math.round(latest.tempC)}°`)
    const energy = parts.join("/")
    const load: Array<string> = []
    if (latest?.cpuPct != null) load.push(`${Math.round(latest.cpuPct)}%`)
    if (latest?.memUsed != null)
      load.push(`${(latest.memUsed / 1024 ** 3).toFixed(1)}gb`)
    const tail = [energy, load.join("/")].filter(Boolean).join(" ")
    document.title = tail ? `${deviceName} - ${tail}` : `${deviceName} Stats`
  }, [deviceName, latest])

  return (
    <main className="mx-auto flex min-h-svh max-w-5xl flex-col gap-3 px-4 py-5 md:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Logo className="h-7 w-7 rounded-[8px]" />
          <h1 className="text-sm font-semibold tracking-tight text-foreground">
            {deviceName} Stats
          </h1>
          {summary.mode === "demo" && (
            <Badge variant="secondary" className="text-[10px]">
              demo data
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3">
          {staleSinceSec !== null && (
            <span className="text-[11px] text-muted-foreground">
              last sample {formatAgo(staleSinceSec)}
            </span>
          )}
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
          colorVar="--chart-1"
          currentValue={formatPct(
            latest?.cpuPct,
            latest?.cpuPct != null && latest.cpuPct < 10 ? 1 : 0
          )}
          points={metricPoints.cpu}
          fromSec={fromSec}
          toSec={toSec}
          formatValue={fmtPct1}
          formatAxis={fmtPct0}
          yMax={100}
          isRefreshing={isRefreshing}
        />
        <MetricCard
          title="RAM"
          colorVar="--chart-2"
          currentValue={formatBytes(latest?.memUsed)}
          currentSub={
            latest?.memTotal ? `of ${formatBytes(latest.memTotal)}` : undefined
          }
          points={metricPoints.mem}
          fromSec={fromSec}
          toSec={toSec}
          formatValue={formatBytes}
          formatAxis={formatBytesAxis}
          yMax={latest?.memTotal ?? undefined}
          isRefreshing={isRefreshing}
        />
        <MetricCard
          title="Temperature"
          colorVar="--chart-3"
          currentValue={formatTemp(latest?.tempC)}
          points={metricPoints.temp}
          fromSec={fromSec}
          toSec={toSec}
          formatValue={formatTemp}
          formatAxis={fmtTempAxis}
          yMinAuto
          emptyHint="No temperature sensor found on this device."
          isRefreshing={isRefreshing}
        />
        <MetricCard
          title="Power"
          colorVar="--chart-4"
          currentValue={formatWatts(latest?.powerW)}
          points={metricPoints.power}
          fromSec={fromSec}
          toSec={toSec}
          formatValue={formatWatts}
          formatAxis={fmtWattsAxis}
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
        v{summary.version}
      </footer>
    </main>
  )
}
