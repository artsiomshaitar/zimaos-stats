import { memo } from "react"
import type { LucideIcon } from "lucide-react"

import { MetricAreaChart } from "@/components/metric-area-chart"
import { SlidingNumber } from "@/components/animate-ui/primitives/texts/sliding-number"
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export interface MetricCardProps {
  title: string
  icon: LucideIcon
  colorVar: string // a chart token, e.g. "--series-ram"
  /** Current headline value; null renders a dash (no data yet). */
  value: number | null
  /** Suffix shown after the animated number, e.g. "%", "GB", "°C". */
  unit: string
  /** Fixed decimals for the sliding number. */
  decimalPlaces: number
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

export const MetricCard = memo(function MetricCard({
  title,
  icon: Icon,
  colorVar,
  value,
  unit,
  decimalPlaces,
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
  return (
    <Card size="sm" className="gap-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5 text-foreground">
          <Icon className="size-4 text-muted-foreground" aria-hidden />
          {title}
        </CardTitle>
        <CardAction className="flex items-baseline gap-1.5">
          {value == null ? (
            <span className="text-xl font-semibold text-foreground">—</span>
          ) : (
            <span className="flex items-baseline text-xl font-semibold text-foreground tabular-nums">
              <SlidingNumber number={value} decimalPlaces={decimalPlaces} />
              <span className="ml-0.5 text-sm font-medium text-muted-foreground">
                {unit}
              </span>
            </span>
          )}
          {currentSub && (
            <span className="text-[11px] text-muted-foreground">
              {currentSub}
            </span>
          )}
        </CardAction>
      </CardHeader>
      <CardContent
        className="px-2 transition-opacity duration-300"
        style={{ opacity: isRefreshing ? 0.6 : 1 }}
      >
        <MetricAreaChart
          label={title}
          icon={Icon}
          colorVar={colorVar}
          points={points}
          fromSec={fromSec}
          toSec={toSec}
          formatValue={formatValue}
          formatAxis={formatAxis}
          yMax={yMax}
          yMinAuto={yMinAuto}
          emptyHint={emptyHint}
        />
      </CardContent>
    </Card>
  )
})
