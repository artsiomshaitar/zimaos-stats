import { memo } from "react"
import { ArrowDown, ArrowUp, Network } from "lucide-react"
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"

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
import {
  formatRate,
  formatRateAxis,
  formatTick,
  formatTooltipTime,
  niceTimeTicks,
} from "@/lib/format"

export interface NetPoint {
  ts: number
  down: number | null
  up: number | null
}

const chartConfig = {
  down: { label: "Download", color: "var(--series-net-down)" },
  up: { label: "Upload", color: "var(--series-net-up)" },
} satisfies ChartConfig

export const NetworkCard = memo(function NetworkCard({
  points,
  down,
  up,
  fromSec,
  toSec,
  isRefreshing,
}: {
  points: Array<NetPoint>
  down: number | null
  up: number | null
  fromSec: number
  toSec: number
  isRefreshing?: boolean
}) {
  const spanSec = toSec - fromSec
  const ticks = niceTimeTicks(fromSec, toSec)
  const hasData = points.some((p) => p.down != null || p.up != null)

  return (
    <Card size="sm" className="gap-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5 text-foreground">
          <Network className="size-4 text-muted-foreground" aria-hidden />
          Network
        </CardTitle>
        <CardAction className="flex items-baseline gap-3 text-sm font-semibold text-foreground tabular-nums">
          <span className="flex items-center gap-1">
            <ArrowDown
              className="size-3.5 text-[var(--series-net-down)]"
              aria-hidden
            />
            {formatRate(down)}
          </span>
          <span className="flex items-center gap-1">
            <ArrowUp
              className="size-3.5 text-[var(--series-net-up)]"
              aria-hidden
            />
            {formatRate(up)}
          </span>
        </CardAction>
      </CardHeader>
      <CardContent
        className="px-2 transition-opacity duration-300"
        style={{ opacity: isRefreshing ? 0.6 : 1 }}
      >
        {hasData ? (
          <ChartContainer config={chartConfig} className="aspect-auto h-36 w-full">
            <AreaChart
              data={points}
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
                domain={[0, "auto"]}
                tickCount={3}
                tickFormatter={formatRateAxis}
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
                    labelFormatter={(_, payload) =>
                      formatTooltipTime(
                        Number((payload[0]?.payload as { ts: number }).ts)
                      )
                    }
                    formatter={(value, name) => (
                      <div className="flex flex-1 items-center justify-between gap-3">
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          {name === "up" ? (
                            <ArrowUp
                              className="size-3.5 text-[var(--series-net-up)]"
                              aria-hidden
                            />
                          ) : (
                            <ArrowDown
                              className="size-3.5 text-[var(--series-net-down)]"
                              aria-hidden
                            />
                          )}
                          {name === "up" ? "Upload" : "Download"}
                        </span>
                        <span className="font-mono font-medium text-foreground tabular-nums">
                          {formatRate(Number(value))}
                        </span>
                      </div>
                    )}
                  />
                }
              />
              <Area
                dataKey="down"
                type="monotone"
                stroke="var(--color-down)"
                strokeWidth={1.5}
                fill="var(--color-down)"
                fillOpacity={0.1}
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
              />
              <Area
                dataKey="up"
                type="monotone"
                stroke="var(--color-up)"
                strokeWidth={1.5}
                fill="var(--color-up)"
                fillOpacity={0.1}
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ChartContainer>
        ) : (
          <div className="flex h-36 items-center justify-center px-2 text-center text-xs text-muted-foreground">
            No network samples in this range yet.
          </div>
        )}
      </CardContent>
    </Card>
  )
})
