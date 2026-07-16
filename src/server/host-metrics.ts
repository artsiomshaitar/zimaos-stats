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

// ---- Network ----

interface NetTotals {
  rx: number
  tx: number
}

// /proc/net/dev is network-namespaced, so a bridge-network container only sees
// its own veth (the dashboard's own traffic). To measure real host throughput
// the host's copy must be bind-mounted in. NET_DEV_PATH overrides; otherwise we
// prefer a host mount and fall back to the container's own (near-zero) view.
const NET_DEV_CANDIDATES = [
  process.env.NET_DEV_PATH,
  "/host/proc/net/dev",
  "/host/net/dev",
  "/proc/net/dev",
].filter((p) => p != null)

function findNetDevPath(): string | null {
  for (const path of NET_DEV_CANDIDATES) {
    try {
      readFileSync(path, "utf8")
      return path
    } catch {
      continue
    }
  }
  return null
}

function parseNetTotals(path: string): NetTotals | null {
  try {
    const lines = readFileSync(path, "utf8").split("\n").slice(2)
    let rx = 0
    let tx = 0
    let seen = false
    for (const line of lines) {
      const [namePart, rest] = line.split(":")
      if (!rest) continue
      const iface = namePart.trim()
      if (
        iface === "lo" ||
        /^(docker|veth|br-|virbr|vnet|tap|tun|cni|flannel|cali|kube)/.test(iface)
      ) {
        continue
      }
      const f = rest.trim().split(/\s+/).map(Number)
      if (f.length < 9) continue
      rx += f[0] // receive bytes
      tx += f[8] // transmit bytes
      seen = true
    }
    return seen ? { rx, tx } : null
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

// Docker masks /sys/devices/virtual/powercap inside containers (RAPL
// side-channel mitigation), and /sys/class/powercap is symlinks into it. The
// documented workaround is bind-mounting the host's powercap dir to /powercap,
// which these candidate roots pick up. POWERCAP_PATH overrides everything.
const RAPL_ROOTS = [
  process.env.POWERCAP_PATH,
  "/sys/class/powercap",
  "/powercap/intel-rapl",
  "/powercap",
  "/sys/devices/virtual/powercap/intel-rapl",
].filter((r) => r != null)

function findRaplDomains(): Array<RaplDomain> {
  for (const base of RAPL_ROOTS) {
    try {
      const domains = readdirSync(base)
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
      if (domains.length > 0) return domains
    } catch {
      continue
    }
  }
  return []
}

export class HostMetricsSource implements MetricsSource {
  private lastCpu: CpuTimes | null = null
  private tempPath = findTempPath()
  private rapl = findRaplDomains()
  private lastRaplReadMs: number | null = null
  private netDevPath = findNetDevPath()
  private lastNet: NetTotals | null = null
  private lastNetReadMs: number | null = null

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

    // Network: byte-counter delta across physical interfaces
    let netRx: number | null = null
    let netTx: number | null = null
    const net = this.netDevPath ? parseNetTotals(this.netDevPath) : null
    if (net) {
      const nowMs = Date.now()
      if (this.lastNet && this.lastNetReadMs !== null && nowMs > this.lastNetReadMs) {
        const dt = (nowMs - this.lastNetReadMs) / 1000
        // Counters only climb; a drop means a reset/reboot — treat as no delta.
        netRx = net.rx >= this.lastNet.rx ? (net.rx - this.lastNet.rx) / dt : null
        netTx = net.tx >= this.lastNet.tx ? (net.tx - this.lastNet.tx) / dt : null
      }
      this.lastNet = net
      this.lastNetReadMs = nowMs
    }

    return {
      cpuPct,
      memUsed: mem?.used ?? null,
      memTotal: mem?.total ?? null,
      tempC,
      powerW,
      netRx,
      netTx,
    }
  }

  async sampleContainers() {
    return sampleDockerContainers()
  }
}
