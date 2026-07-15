import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

import type { MetricsSource, SystemSample } from "./types"
import { sampleDockerContainers } from "./docker-metrics"

export function hostIsReadable(): boolean {
  try {
    readFileSync("/proc/stat", "utf8")
    return true
  } catch {
    return false
  }
}

function readNumberFile(path: string): number | null {
  try {
    const n = Number.parseInt(readFileSync(path, "utf8").trim(), 10)
    return Number.isNaN(n) ? null : n
  } catch {
    return null
  }
}

// ---- CPU ----

interface CpuTimes {
  busy: number
  total: number
}

function readCpuTimes(): CpuTimes | null {
  try {
    const line = readFileSync("/proc/stat", "utf8")
      .split("\n")
      .find((l) => l.startsWith("cpu "))
    if (!line) return null
    const fields = line.trim().split(/\s+/).slice(1).map(Number)
    const total = fields.reduce((a, b) => a + b, 0)
    const idle = (fields[3] ?? 0) + (fields[4] ?? 0) // idle + iowait
    return { busy: total - idle, total }
  } catch {
    return null
  }
}

// ---- Memory ----

function readMemory(): { used: number; total: number } | null {
  try {
    const text = readFileSync("/proc/meminfo", "utf8")
    const get = (key: string) => {
      const m = text.match(new RegExp(`^${key}:\\s+(\\d+) kB`, "m"))
      return m ? Number.parseInt(m[1], 10) * 1024 : null
    }
    const total = get("MemTotal")
    const available = get("MemAvailable")
    if (total == null || available == null) return null
    return { used: total - available, total }
  } catch {
    return null
  }
}

// ---- Temperature ----

// Preferred sensor types, best first. x86_pkg_temp is the CPU package on
// Intel boards (ZimaBoard/ZimaCube); the rest are common ARM/ACPI fallbacks.
const THERMAL_PREFERENCE = [
  "x86_pkg_temp",
  "cpu_thermal",
  "cpu-thermal",
  "soc_thermal",
  "acpitz",
]

function findTempPath(): string | null {
  try {
    const base = "/sys/class/thermal"
    const zones = readdirSync(base).filter((d) => d.startsWith("thermal_zone"))
    const typed = zones
      .map((z) => {
        try {
          return {
            zone: z,
            type: readFileSync(join(base, z, "type"), "utf8").trim(),
          }
        } catch {
          return null
        }
      })
      .filter((z) => z !== null)
    for (const pref of THERMAL_PREFERENCE) {
      const hit = typed.find((z) => z.type === pref)
      if (hit) return join(base, hit.zone, "temp")
    }
    if (typed.length > 0) return join(base, typed[0].zone, "temp")
  } catch {
    // fall through to hwmon
  }
  try {
    const base = "/sys/class/hwmon"
    for (const dir of readdirSync(base)) {
      try {
        const name = readFileSync(join(base, dir, "name"), "utf8").trim()
        if (["coretemp", "k10temp", "cpu_thermal"].includes(name)) {
          const temp = join(base, dir, "temp1_input")
          if (existsSync(temp)) return temp
        }
      } catch {
        continue
      }
    }
  } catch {
    // no sensors at all
  }
  return null
}

// ---- Power (Intel RAPL) ----

interface RaplDomain {
  energyPath: string
  maxRange: number
  lastEnergy: number | null
}

function findRaplDomains(): Array<RaplDomain> {
  const base = "/sys/class/powercap"
  try {
    return (
      readdirSync(base)
        // top-level package domains only, e.g. intel-rapl:0 (skip subdomains like intel-rapl:0:1)
        .filter((d) => /^intel-rapl:\d+$/.test(d))
        .map((d) => ({
          energyPath: join(base, d, "energy_uj"),
          maxRange:
            readNumberFile(join(base, d, "max_energy_range_uj")) ??
            Number.MAX_SAFE_INTEGER,
          lastEnergy: null,
        }))
        .filter((d) => readNumberFile(d.energyPath) !== null)
    )
  } catch {
    return []
  }
}

export class HostMetricsSource implements MetricsSource {
  private lastCpu: CpuTimes | null = null
  private tempPath = findTempPath()
  private rapl = findRaplDomains()
  private lastRaplReadMs: number | null = null

  async sampleSystem(): Promise<Omit<SystemSample, "ts">> {
    // CPU: delta against the previous poll
    let cpuPct: number | null = null
    const cpu = readCpuTimes()
    if (cpu && this.lastCpu && cpu.total > this.lastCpu.total) {
      cpuPct =
        ((cpu.busy - this.lastCpu.busy) / (cpu.total - this.lastCpu.total)) *
        100
      cpuPct = Math.min(100, Math.max(0, cpuPct))
    }
    if (cpu) this.lastCpu = cpu

    const mem = readMemory()

    let tempC: number | null = null
    if (this.tempPath) {
      const milli = readNumberFile(this.tempPath)
      if (milli !== null) tempC = milli / 1000
    }

    // Power: energy counter delta across all package domains
    let powerW: number | null = null
    if (this.rapl.length > 0) {
      const nowMs = Date.now()
      let totalDeltaUj = 0
      let haveDelta = false
      for (const domain of this.rapl) {
        const energy = readNumberFile(domain.energyPath)
        if (energy === null) continue
        if (domain.lastEnergy !== null && this.lastRaplReadMs !== null) {
          let delta = energy - domain.lastEnergy
          if (delta < 0) delta += domain.maxRange // counter wrapped
          totalDeltaUj += delta
          haveDelta = true
        }
        domain.lastEnergy = energy
      }
      if (
        haveDelta &&
        this.lastRaplReadMs !== null &&
        nowMs > this.lastRaplReadMs
      ) {
        powerW = totalDeltaUj / 1e6 / ((nowMs - this.lastRaplReadMs) / 1000)
      }
      this.lastRaplReadMs = nowMs
    }

    return {
      cpuPct,
      memUsed: mem?.used ?? null,
      memTotal: mem?.total ?? null,
      tempC,
      powerW,
    }
  }

  async sampleContainers() {
    return sampleDockerContainers()
  }
}
