export interface RangePreset {
  key: string
  label: string
  seconds: number
}

export const RANGES: Array<RangePreset> = [
  { key: "5m", label: "5M", seconds: 300 },
  { key: "10m", label: "10M", seconds: 600 },
  { key: "1h", label: "1H", seconds: 3600 },
  { key: "6h", label: "6H", seconds: 6 * 3600 },
  { key: "24h", label: "24H", seconds: 86400 },
  { key: "7d", label: "7D", seconds: 7 * 86400 },
]

export const DEFAULT_RANGE_KEY = "10m"

export function rangeByKey(key: string): RangePreset {
  return RANGES.find((r) => r.key === key) ?? RANGES[1]
}

/** Short ranges refetch fast to feel live; long ranges don't need to. */
export function refreshMsFor(range: RangePreset): number {
  return range.seconds <= 600 ? 5_000 : 30_000
}
