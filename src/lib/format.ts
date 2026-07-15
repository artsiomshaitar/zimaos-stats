export function formatBytes(n: number | null | undefined): string {
  if (n == null) return "—"
  const gb = n / 1024 ** 3
  if (gb >= 10) return `${gb.toFixed(0)} GB`
  if (gb >= 1) return `${gb.toFixed(2)} GB`
  const mb = n / 1024 ** 2
  if (mb >= 1) return `${mb.toFixed(0)} MB`
  return `${(n / 1024).toFixed(0)} KB`
}

/** Compact byte label for axis ticks: 8G / 512M / 0 */
export function formatBytesAxis(n: number): string {
  if (n === 0) return "0"
  const gb = n / 1024 ** 3
  if (gb >= 1) return `${gb >= 10 ? gb.toFixed(0) : gb.toFixed(1)}G`
  return `${(n / 1024 ** 2).toFixed(0)}M`
}

export function formatPct(n: number | null | undefined, digits = 0): string {
  if (n == null) return "—"
  return `${n.toFixed(digits)}%`
}

export function formatTemp(n: number | null | undefined): string {
  if (n == null) return "—"
  return `${n.toFixed(1)}°C`
}

export function formatWatts(n: number | null | undefined): string {
  if (n == null) return "—"
  return `${n.toFixed(1)} W`
}

const tickShort = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
})
const tickDay = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
})
const tooltipFmt = new Intl.DateTimeFormat("en-GB", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
})

export function formatTick(tsSec: number, spanSec: number): string {
  const d = new Date(tsSec * 1000)
  return spanSec > 86400 ? tickDay.format(d) : tickShort.format(d)
}

export function formatTooltipTime(tsSec: number): string {
  return tooltipFmt.format(new Date(tsSec * 1000))
}

export function formatAgo(sec: number): string {
  if (sec < 60) return `${Math.max(0, Math.round(sec))}s ago`
  if (sec < 3600) return `${Math.round(sec / 60)}m ago`
  return `${Math.round(sec / 3600)}h ago`
}

/** Evenly spaced round-numbered tick positions for a time range. */
export function niceTimeTicks(
  fromSec: number,
  toSec: number,
  target = 5
): Array<number> {
  const span = toSec - fromSec
  const steps = [
    60,
    120,
    300,
    900,
    1800,
    3600,
    2 * 3600,
    4 * 3600,
    6 * 3600,
    12 * 3600,
    86400,
    2 * 86400,
  ]
  const step = steps.find((s) => span / s <= target) ?? 2 * 86400
  const ticks: Array<number> = []
  for (let t = Math.ceil(fromSec / step) * step; t <= toSec; t += step)
    ticks.push(t)
  return ticks
}
