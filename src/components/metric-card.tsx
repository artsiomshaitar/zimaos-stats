import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"

import { Card } from "@/components/ui/card"
import { ChartContainer, ChartTooltip } from "@/components/ui/chart"
import { StatsTooltipFrame } from "@/components/stats-tooltip"
import { formatTick, niceTimeTicks } from "@/lib/format"

export interface MetricCardProps {
  title: string
  colorVar: string // e.g. "--chart-cpu"
  currentValue: string
  currentSub?: string
  points: Array<{ ts: number; value: number | null }>
  fromSec: number
  toSec: number
  formatValue: (v: number) => string
  formatAxis: (v: number) => string
  /** Fixed upper bound (e.g. 100 for %); otherwise scales to data. */
  yMax?: number
  /** Let the lower bound follow the data (temperature) instead of 0. */
  yMinAuto?: boolean
  emptyHint?: string
  isRefreshing?: boolean
}

export function MetricCard({
  title,
  colorVar,
  currentValue,
  currentSub,
  points,
  fromSec,
  toSec,
  formatValue,
  formatAxis,
  yMax,
  yMinAuto,
  emptyHint,
  isRefreshing,
}: MetricCardProps) {
  const spanSec = toSec - fromSec
  const ticks = niceTimeTicks(fromSec, toSec)
  const hasData = points.some((p) => p.value != null)
  const color = `var(${colorVar})`

  return (
    <Card className="gap-0 overflow-hidden rounded-xl border-border bg-card p-0">
      <div className="flex items-baseline justify-between px-4 pt-3.5 pb-1">
        <h2 className="text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
          {title}
        </h2>
        <div className="flex items-baseline gap-1.5">
          <span className="text-xl font-semibold text-foreground">
            {currentValue}
          </span>
          {currentSub && (
            <span className="text-[11px] text-muted-foreground">
              {currentSub}
            </span>
          )}
        </div>
      </div>
      <div
        className="px-1 pb-1 transition-opacity duration-300"
        style={{ opacity: isRefreshing ? 0.6 : 1 }}
      >
        {hasData ? (
          <ChartContainer config={{}} className="aspect-auto h-36 w-full">
            <AreaChart
              data={points}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            >
              <CartesianGrid
                vertical={false}
                stroke="var(--gridline)"
                strokeWidth={1}
              />
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
                domain={[yMinAuto ? "auto" : 0, yMax ?? "auto"]}
                tickCount={3}
                tickFormatter={(v: number) => formatAxis(v)}
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10 }}
                width={44}
              />
              <ChartTooltip
                cursor={{
                  stroke: "var(--muted-foreground)",
                  strokeWidth: 1,
                  strokeOpacity: 0.4,
                }}
                isAnimationActive={false}
                content={({ active, payload }) => {
                  if (!active || payload.length === 0) return null
                  const p = payload[0].payload as {
                    ts: number
                    value: number | null
                  }
                  if (p.value == null) return null
                  return (
                    <StatsTooltipFrame
                      tsSec={p.ts}
                      rows={[
                        { color, name: title, value: formatValue(p.value) },
                      ]}
                    />
                  )
                }}
              />
              <Area
                dataKey="value"
                type="monotone"
                stroke={color}
                strokeWidth={2}
                fill={color}
                fillOpacity={0.1}
                dot={false}
                activeDot={{
                  r: 4,
                  fill: color,
                  stroke: "var(--card)",
                  strokeWidth: 2,
                }}
                connectNulls={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ChartContainer>
        ) : (
          <div className="flex h-36 items-center justify-center px-4 text-center text-xs text-muted-foreground">
            {emptyHint ?? "No samples in this range yet."}
          </div>
        )}
      </div>
    </Card>
  )
}
