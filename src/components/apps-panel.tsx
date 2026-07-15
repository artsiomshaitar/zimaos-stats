import { memo, useMemo, useState } from "react"
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"

import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import type { ChartConfig } from "@/components/ui/chart"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  formatBytes,
  formatBytesAxis,
  formatPct,
  formatTick,
  formatTooltipTime,
  niceTimeTicks,
} from "@/lib/format"
import type { ContainerSeries } from "@/server/queries"

const SLOT_VARS = [
  "--series-1",
  "--series-2",
  "--series-3",
  "--series-4",
  "--series-5",
] as const
const MAX_CHARTED = 5

// Sticky container-id → color-slot assignment. Colors follow the app, not its
// current rank, so a container keeps its hue across range/tab changes.
const slotByContainer = new Map<string, number>()

function assignSlots(chartedIds: Array<string>): Map<string, string> {
  const taken = new Set(
    [...slotByContainer.entries()]
      .filter(([id]) => chartedIds.includes(id))
      .map(([, slot]) => slot)
  )
  for (const id of chartedIds) {
    if (slotByContainer.has(id)) continue
    let slot = SLOT_VARS.findIndex(
      (_, i) => !taken.has(i) && ![...slotByContainer.values()].includes(i)
    )
    if (slot === -1) slot = SLOT_VARS.findIndex((_, i) => !taken.has(i)) // reclaim from a non-charted holder
    if (slot === -1) slot = 0
    for (const [otherId, otherSlot] of slotByContainer) {
      if (otherSlot === slot) slotByContainer.delete(otherId)
    }
    slotByContainer.set(id, slot)
    taken.add(slot)
  }
  return new Map(
    chartedIds.map((id) => [
      id,
      `var(${SLOT_VARS[slotByContainer.get(id) ?? 0]})`,
    ])
  )
}

type Metric = "cpu" | "ram"

function AppIcon({ name, icon }: { name: string; icon: string | null }) {
  const [failed, setFailed] = useState(false)
  if (icon && !failed) {
    return (
      <img
        src={icon}
        alt=""
        className="h-4 w-4 shrink-0 rounded-[4px] object-cover"
        onError={() => setFailed(true)}
      />
    )
  }
  return (
    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] bg-secondary text-[9px] font-semibold text-muted-foreground uppercase">
      {name.slice(0, 1)}
    </span>
  )
}

export const AppsPanel = memo(function AppsPanel({
  series,
  fromSec,
  toSec,
  isRefreshing,
}: {
  series: Array<ContainerSeries>
  fromSec: number
  toSec: number
  isRefreshing?: boolean
}) {
  const [metric, setMetric] = useState<Metric>("cpu")
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const spanSec = toSec - fromSec
  const ticks = niceTimeTicks(fromSec, toSec)

  const ranked = useMemo(() => {
    const value = (s: ContainerSeries) =>
      metric === "cpu" ? s.avgCpuPct : (s.lastMemUsed ?? 0)
    return [...series].sort((a, b) => value(b) - value(a))
  }, [series, metric])

  const charted = ranked.slice(0, MAX_CHARTED)
  const colorById = assignSlots(charted.map((c) => c.id))

  const chartConfig: ChartConfig = Object.fromEntries(
    charted.map((s) => [s.id, { label: s.name, color: colorById.get(s.id) }])
  )
  const nameById = new Map(charted.map((s) => [s.id, s.name]))

  const rows = useMemo(() => {
    const byTs = new Map<
      number,
      Record<string, number | null> & { ts: number }
    >()
    for (const s of charted) {
      for (const p of s.points) {
        let row = byTs.get(p.ts)
        if (!row) {
          row = { ts: p.ts }
          byTs.set(p.ts, row)
        }
        row[s.id] = metric === "cpu" ? p.cpuPct : p.memUsed
      }
    }
    return [...byTs.values()].sort((a, b) => a.ts - b.ts)
  }, [charted, metric])

  const fmtValue =
    metric === "cpu" ? (v: number) => formatPct(v, 1) : formatBytes
  const fmtAxis =
    metric === "cpu" ? (v: number) => formatPct(v) : formatBytesAxis

  // Dimming only kicks in when the hovered app is actually one of the plotted lines.
  const dimActive = hoveredId !== null && colorById.has(hoveredId)
  const lineOpacity = (id: string) => (dimActive && id !== hoveredId ? 0.12 : 1)

  return (
    <Card size="sm" className="gap-4">
      <CardHeader>
        <CardTitle className="text-muted-foreground">Apps</CardTitle>
        <CardAction>
          <Tabs value={metric} onValueChange={(v) => setMetric(v as Metric)}>
            <TabsList className="h-7">
              <TabsTrigger value="cpu" className="px-3 text-[11px]">
                CPU
              </TabsTrigger>
              <TabsTrigger value="ram" className="px-3 text-[11px]">
                RAM
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </CardAction>
      </CardHeader>

      {series.length === 0 ? (
        <CardContent>
          <div className="flex h-40 flex-col items-center justify-center gap-1 text-center">
            <p className="text-xs text-foreground">No app data recorded yet.</p>
            <p className="text-xs text-muted-foreground">
              Mount /var/run/docker.sock into this container to record per-app
              CPU and RAM.
            </p>
          </div>
        </CardContent>
      ) : (
        <>
          <CardContent
            className="px-2 transition-opacity duration-300"
            style={{ opacity: isRefreshing ? 0.6 : 1 }}
          >
            <ChartContainer
              config={chartConfig}
              className="aspect-auto h-48 w-full"
            >
              <LineChart
                data={rows}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
              >
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="ts"
                  type="number"
                  domain={[fromSec, toSec]}
                  ticks={ticks}
                  tickFormatter={(v: number) => formatTick(v, spanSec)}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10 }}
                  minTickGap={40}
                />
                <YAxis
                  domain={[
                    0,
                    (dataMax: number) =>
                      metric === "cpu" ? Math.max(1, dataMax) : dataMax,
                  ]}
                  tickCount={3}
                  tickFormatter={fmtAxis}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10 }}
                  width={44}
                />
                <ChartTooltip
                  isAnimationActive={false}
                  content={
                    <ChartTooltipContent
                      indicator="line"
                      labelFormatter={(_, payload) =>
                        formatTooltipTime(
                          Number((payload[0]?.payload as { ts: number }).ts)
                        )
                      }
                      formatter={(value, name) => (
                        <div className="flex flex-1 items-center justify-between gap-3">
                          <span className="text-muted-foreground">
                            {nameById.get(String(name)) ?? String(name)}
                          </span>
                          <span className="font-mono font-medium text-foreground tabular-nums">
                            {fmtValue(Number(value))}
                          </span>
                        </div>
                      )}
                    />
                  }
                />
                {charted.map((s) => (
                  <Line
                    key={s.id}
                    dataKey={s.id}
                    type="monotone"
                    stroke={`var(--color-${s.id})`}
                    strokeWidth={dimActive && s.id === hoveredId ? 2.5 : 2}
                    strokeOpacity={lineOpacity(s.id)}
                    dot={false}
                    activeDot={{ r: 4 }}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ChartContainer>

            <div className="flex flex-wrap gap-x-4 gap-y-1 pt-2">
              {charted.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className="flex items-center gap-1.5 text-[11px] text-muted-foreground transition-opacity hover:text-foreground"
                  style={{ opacity: lineOpacity(s.id) }}
                  onMouseEnter={() => setHoveredId(s.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onFocus={() => setHoveredId(s.id)}
                  onBlur={() => setHoveredId(null)}
                >
                  <span
                    aria-hidden
                    className="h-0.5 w-3 rounded-full"
                    style={{ backgroundColor: colorById.get(s.id) }}
                  />
                  {s.name}
                </button>
              ))}
            </div>
          </CardContent>

          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="px-4">App</TableHead>
                  <TableHead className="w-24 text-right">CPU avg</TableHead>
                  <TableHead className="w-24 text-right">CPU now</TableHead>
                  <TableHead className="w-28 px-4 text-right">
                    RAM now
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ranked.map((s) => (
                  <TableRow
                    key={s.id}
                    className="transition-opacity"
                    style={{
                      opacity: dimActive && s.id !== hoveredId ? 0.4 : 1,
                    }}
                    onMouseEnter={() => setHoveredId(s.id)}
                    onMouseLeave={() => setHoveredId(null)}
                  >
                    <TableCell className="px-4">
                      <span className="flex items-center gap-2">
                        <AppIcon name={s.name} icon={s.icon} />
                        <span className="truncate text-foreground">
                          {s.name}
                        </span>
                        {colorById.has(s.id) && (
                          <span
                            aria-hidden
                            className="h-1 w-1 rounded-full"
                            style={{ backgroundColor: colorById.get(s.id) }}
                          />
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground tabular-nums">
                      {formatPct(s.avgCpuPct, 1)}
                    </TableCell>
                    <TableCell className="text-right text-foreground tabular-nums">
                      {s.lastCpuPct == null ? "—" : formatPct(s.lastCpuPct, 1)}
                    </TableCell>
                    <TableCell className="px-4 text-right text-foreground tabular-nums">
                      {formatBytes(s.lastMemUsed)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </>
      )}
    </Card>
  )
})
