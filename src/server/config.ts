function envInt(name: string, def: number, min: number, max: number): number {
  const raw = process.env[name]
  if (!raw) return def
  const n = Number.parseInt(raw, 10)
  if (Number.isNaN(n)) return def
  return Math.min(max, Math.max(min, n))
}

export type CollectorMode = "auto" | "host" | "demo"

export const config = {
  /** How many days of samples to keep. */
  historyDays: envInt("HISTORY_DAYS", 7, 1, 365),
  /** Seconds between samples. */
  pollIntervalSeconds: envInt("POLL_INTERVAL_SECONDS", 15, 2, 3600),
  /** Where the SQLite file lives. Point a volume at its directory. */
  dbPath: process.env.DB_PATH ?? "./data/zimaos-stats.db",
  /** Docker socket used for per-container stats. */
  dockerSocket: process.env.DOCKER_SOCKET ?? "/var/run/docker.sock",
  /** auto: host metrics when /proc is readable, demo data otherwise. */
  mode: (process.env.COLLECTOR_MODE ?? "auto") as CollectorMode,
}
