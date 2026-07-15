import type { ContainerSample, MetricsSource, SystemSample } from "./types"

// Synthetic-but-plausible signals for developing off-device (e.g. on macOS,
// where /proc and the Docker socket aren't available).

const GB = 1024 ** 3
const MEM_TOTAL = 8 * GB

const DEMO_CONTAINERS = [
  { id: "demo-jellyfin", name: "Jellyfin", baseCpu: 2, baseMem: 0.9 * GB },
  {
    id: "demo-homeassist",
    name: "Home Assistant",
    baseCpu: 1.2,
    baseMem: 0.5 * GB,
  },
  {
    id: "demo-speedtest",
    name: "Speedtest Tracker",
    baseCpu: 0.4,
    baseMem: 0.25 * GB,
  },
  { id: "demo-immich", name: "Immich", baseCpu: 3, baseMem: 1.1 * GB },
]

function wave(tsSec: number, periodSec: number, phase: number): number {
  return (Math.sin((tsSec / periodSec) * 2 * Math.PI + phase) + 1) / 2 // 0..1
}

function noise(scale: number): number {
  return (Math.random() - 0.5) * 2 * scale
}

export function demoSystemAt(tsSec: number): Omit<SystemSample, "ts"> {
  const daily = wave(tsSec, 86400, -Math.PI / 2) // low at night, high midday
  const fast = wave(tsSec, 600, 0)
  const spike = wave(tsSec, 5400, 1) > 0.96 ? 35 : 0
  const cpuPct = Math.min(
    100,
    Math.max(0.5, 4 + daily * 14 + fast * 6 + spike + noise(2))
  )
  const memUsed = Math.min(
    MEM_TOTAL * 0.95,
    MEM_TOTAL * (0.28 + daily * 0.15 + fast * 0.04 + noise(0.01))
  )
  // Bursty network: a fast carrier with occasional spikes, download > upload.
  const burst = wave(tsSec, 45, 0) ** 3
  const KB = 1024
  const netRx = Math.max(0, (6 + daily * 8 + burst * 40 + noise(3)) * KB)
  const netTx = Math.max(0, (2 + daily * 3 + burst * 12 + noise(1.5)) * KB)
  return {
    cpuPct,
    memUsed,
    memTotal: MEM_TOTAL,
    tempC: 36 + cpuPct * 0.35 + noise(0.6),
    powerW: 1.4 + cpuPct * 0.11 + noise(0.15),
    netRx,
    netTx,
  }
}

export function demoContainersAt(tsSec: number): Array<ContainerSample> {
  return DEMO_CONTAINERS.map((c, i) => {
    const activity = wave(tsSec, 3600 + i * 900, i * 1.7)
    return {
      id: c.id,
      name: c.name,
      icon: null,
      cpuPct: Math.max(0, c.baseCpu * (0.3 + activity * 1.6) + noise(0.3)),
      memUsed: Math.max(
        64 * 1024 ** 2,
        c.baseMem * (0.85 + activity * 0.25) + noise(0.02 * GB)
      ),
    }
  })
}

export class DemoMetricsSource implements MetricsSource {
  async sampleSystem() {
    return demoSystemAt(Date.now() / 1000)
  }

  async sampleContainers() {
    return demoContainersAt(Date.now() / 1000)
  }
}
