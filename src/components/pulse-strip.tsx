import { useMemo } from "react"

import type { SystemPoint } from "@/server/queries"

const W = 1000
const H = 44

/**
 * The whole retention window as a quiet CPU silhouette, with the currently
 * selected time range lit up — context and orientation in one element.
 */
export function PulseStrip({
  points,
  retentionFrom,
  now,
  selectedFrom,
  historyDays,
}: {
  points: Array<SystemPoint>
  retentionFrom: number
  now: number
  selectedFrom: number
  historyDays: number
}) {
  const span = Math.max(1, now - retentionFrom)

  const { areaPath, linePath } = useMemo(() => {
    const usable = points.filter((p) => p.cpuPct != null)
    if (usable.length < 2) return { areaPath: "", linePath: "" }
    const x = (ts: number) => ((ts - retentionFrom) / span) * W
    const y = (cpu: number) => H - 3 - (Math.min(100, cpu) / 100) * (H - 8)
    let line = ""
    for (const p of usable) {
      line += `${line ? "L" : "M"}${x(p.ts).toFixed(1)},${y(p.cpuPct!).toFixed(1)}`
    }
    const first = usable[0]
    const last = usable[usable.length - 1]
    const area = `${line}L${x(last.ts).toFixed(1)},${H}L${x(first.ts).toFixed(1)},${H}Z`
    return { areaPath: area, linePath: line }
  }, [points, retentionFrom, span])

  const selX = ((selectedFrom - retentionFrom) / span) * W
  const selW = W - selX

  return (
    <figure
      className="group relative m-0"
      aria-label={`CPU over the last ${historyDays} days; highlighted section is the selected range`}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="block h-11 w-full"
        role="img"
        aria-hidden
      >
        <defs>
          <clipPath id="pulse-sel">
            <rect x={selX} y={0} width={Math.max(0, selW)} height={H} />
          </clipPath>
        </defs>
        {areaPath && (
          <>
            <path d={areaPath} fill="var(--gridline)" opacity={0.6} />
            <path
              d={linePath}
              fill="none"
              stroke="var(--muted-foreground)"
              strokeOpacity={0.5}
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
            <g clipPath="url(#pulse-sel)">
              <path d={areaPath} fill="var(--chart-cpu)" opacity={0.18} />
              <path
                d={linePath}
                fill="none"
                stroke="var(--primary)"
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
              />
            </g>
            <line
              x1={selX}
              x2={selX}
              y1={0}
              y2={H}
              stroke="var(--primary)"
              strokeOpacity={0.5}
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          </>
        )}
      </svg>
      <figcaption className="sr-only">
        CPU usage across the full {historyDays}-day retention window
      </figcaption>
    </figure>
  )
}
