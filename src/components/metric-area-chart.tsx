import type { LucideIcon } from "lucide-react"
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"

import type { ChartConfig } from "@/components/ui/chart"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import { formatTick, formatTooltipTime, niceTimeTicks } from "@/lib/format"

export interface MetricAreaChartProps {
  /** Tooltip/legend label for the single series. */
  label: string
  /** Icon shown in the tooltip beside the label. */
  icon?: LucideIcon
  colorVar: string // a chart token, e.g. "--series-cpu"
  points: Array<{ ts: number; value: number | null }>
  fromSec: number
  toSec: number
  formatValue: (v: number) => string
  formatAxis: (v: number) => string
  yMax?: number
  yMinAuto?: boolean
  emptyHint?: string
  className?: string
}

/** Single-series time-area chart shared by the metric cards. */
export function MetricAreaChart({
  label,
  icon: Icon,
  colorVar,
  points,
  fromSec,
  toSec,
  formatValue,
  formatAxis,
  yMax,
  yMinAuto,
  emptyHint,
  className = "aspect-auto h-36 w-full",
}: MetricAreaChartProps) {
  const spanSec = toSec - fromSec
  const ticks = niceTimeTicks(fromSec, toSec)
  const hasData = points.some((p) => p.value != null)

  const chartConfig = {
    value: { label, color: `var(${colorVar})` },
  } satisfies ChartConfig

  if (!hasData) {
    return (
      <div className="flex h-36 items-center justify-center px-2 text-center text-xs text-muted-foreground">
        {emptyHint ?? "No samples in this range yet."}
      </div>
    )
  }

  return (
    <ChartContainer config={chartConfig} className={className}>
      <AreaChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
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
          domain={[yMinAuto ? "auto" : 0, yMax ?? "auto"]}
          tickCount={3}
          tickFormatter={(v: number) => formatAxis(v)}
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: 10 }}
          width={52}
        />
        <ChartTooltip
          isAnimationActive={false}
          content={
            <ChartTooltipContent
              indicator="line"
              // Single-series + custom formatter means ChartTooltipContent
              // never renders its label, so the timestamp lives in here.
              formatter={(v, _name, _item, _index, p) => (
                <div className="flex flex-1 flex-col gap-1.5">
                  <div className="font-medium">
                    {formatTooltipTime(
                      Number((p as unknown as { ts: number }).ts)
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      {Icon && <Icon className="size-3.5" aria-hidden />}
                      {label}
                    </span>
                    <span className="font-mono font-medium text-foreground tabular-nums">
                      {formatValue(Number(v))}
                    </span>
                  </div>
                </div>
              )}
            />
          }
        />
        <Area
          dataKey="value"
          type="monotone"
          stroke="var(--color-value)"
          strokeWidth={1.5}
          fill="var(--color-value)"
          fillOpacity={0.1}
          dot={false}
          connectNulls={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ChartContainer>
  )
}
