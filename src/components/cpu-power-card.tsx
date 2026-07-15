import { memo, useState } from "react"
import { Cpu, Plug } from "lucide-react"

import { MetricAreaChart } from "@/components/metric-area-chart"
import { SlidingNumber } from "@/components/animate-ui/primitives/texts/sliding-number"
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
} from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { formatPct, formatWatts } from "@/lib/format"

type Tab = "cpu" | "power"

type Point = { ts: number; value: number | null }

function Unit({ children }: { children: string }) {
  return (
    <span className="text-sm font-medium text-muted-foreground">{children}</span>
  )
}

export const CpuPowerCard = memo(function CpuPowerCard({
  cpuValue,
  powerValue,
  cpuPoints,
  powerPoints,
  fromSec,
  toSec,
  isRefreshing,
}: {
  cpuValue: number | null
  powerValue: number | null
  cpuPoints: Array<Point>
  powerPoints: Array<Point>
  fromSec: number
  toSec: number
  isRefreshing?: boolean
}) {
  const [tab, setTab] = useState<Tab>("cpu")

  return (
    <Card size="sm" className="gap-4">
      <CardHeader>
        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as Tab)}
          className="-translate-y-1"
        >
          <TabsList
            variant="line"
            className="h-auto gap-3 p-0 text-muted-foreground"
          >
            <TabsTrigger value="cpu" className="px-0 pt-0 pb-1">
              <Cpu className="size-4" aria-hidden />
              CPU
            </TabsTrigger>
            <TabsTrigger value="power" className="px-0 pt-0 pb-1">
              <Plug className="size-4" aria-hidden />
              Power
            </TabsTrigger>
          </TabsList>
        </Tabs>
        {/* Always both values, regardless of the active tab. */}
        <CardAction className="flex items-baseline gap-1 text-xl font-semibold text-foreground tabular-nums">
          {cpuValue == null ? (
            "—"
          ) : (
            <span className="flex items-baseline">
              <SlidingNumber number={cpuValue} decimalPlaces={1} />
              <Unit>%</Unit>
            </span>
          )}
          <span className="text-sm font-normal text-muted-foreground">/</span>
          {powerValue == null ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            <span className="flex items-baseline">
              <SlidingNumber number={powerValue} decimalPlaces={1} />
              <Unit>W</Unit>
            </span>
          )}
        </CardAction>
      </CardHeader>
      <CardContent
        className="px-2 transition-opacity duration-300"
        style={{ opacity: isRefreshing ? 0.6 : 1 }}
      >
        {tab === "cpu" ? (
          <MetricAreaChart
            label="CPU"
            icon={Cpu}
            colorVar="--series-cpu"
            points={cpuPoints}
            fromSec={fromSec}
            toSec={toSec}
            formatValue={(v) => formatPct(v, 1)}
            formatAxis={(v) => formatPct(v)}
            yMax={100}
          />
        ) : (
          <MetricAreaChart
            label="Power"
            icon={Plug}
            colorVar="--series-power"
            points={powerPoints}
            fromSec={fromSec}
            toSec={toSec}
            formatValue={formatWatts}
            formatAxis={(v) => `${Math.round(v)} W`}
            emptyHint="Docker hides power sensors by default — add a volume from /sys/devices/virtual/powercap to /powercap and restart."
          />
        )}
      </CardContent>
    </Card>
  )
})
