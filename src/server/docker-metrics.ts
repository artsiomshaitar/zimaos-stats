import http from "node:http"

import { config } from "./config"
import type { ContainerSample } from "./types"

function dockerGet(path: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { socketPath: config.dockerSocket, path, method: "GET", timeout: 5000 },
      (res) => {
        let body = ""
        res.setEncoding("utf8")
        res.on("data", (chunk) => (body += chunk))
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(body))
            } catch (e) {
              reject(e)
            }
          } else {
            reject(new Error(`docker API ${path} -> ${res.statusCode}`))
          }
        })
      }
    )
    req.on("timeout", () =>
      req.destroy(new Error(`docker API ${path} timed out`))
    )
    req.on("error", reject)
    req.end()
  })
}

// Labels ZimaOS/CasaOS put on app containers.
function iconFromLabels(
  labels: Record<string, string | undefined> | null
): string | null {
  if (!labels) return null
  return (
    labels["icon"] ??
    labels["casaos.icon"] ??
    labels["sh.icewhale.icon"] ??
    null
  )
}

function nameFromContainer(c: any): string {
  const label = c.Labels?.["name"] ?? c.Labels?.["casaos.name"]
  if (label) return label
  const raw: string = c.Names?.[0] ?? c.Id.slice(0, 12)
  return raw.replace(/^\//, "")
}

// ZimaOS/CasaOS installs an app as a compose project; a multi-container app
// (e.g. Speedtest Tracker + its db) shares one com.docker.compose.project
// label. Group by it so the list matches the widget: one row per app.
function appKeyFromContainer(c: any): string | null {
  return c.Labels?.["com.docker.compose.project"] ?? null
}

// "big-bear-speedtest-tracker" -> "Speedtest Tracker"
function prettifyAppKey(key: string): string {
  return key
    .replace(/^big-bear-/, "")
    .split(/[-_]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
}

interface PrevCpu {
  containerNs: number
  systemNs: number | null
  wallMs: number
}

// Previous CPU counters per container, so each poll only needs one cheap
// one-shot stats call (no 1s blocking pre-sample per container).
const prevCpuByContainer = new Map<string, PrevCpu>()

async function sampleOne(c: any): Promise<ContainerSample | null> {
  const id: string = c.Id
  try {
    const stats = await dockerGet(
      `/containers/${id}/stats?stream=false&one-shot=true`
    )
    const wallMs = Date.now()

    const containerNs: number = stats.cpu_stats?.cpu_usage?.total_usage ?? 0
    const systemNs: number | null = stats.cpu_stats?.system_cpu_usage ?? null
    const onlineCpus: number =
      stats.cpu_stats?.online_cpus ||
      stats.cpu_stats?.cpu_usage?.percpu_usage?.length ||
      1

    let cpuPct: number | null = null
    const prev = prevCpuByContainer.get(id)
    if (prev) {
      const deltaContainer = containerNs - prev.containerNs
      if (
        systemNs !== null &&
        prev.systemNs !== null &&
        systemNs > prev.systemNs
      ) {
        // % of total host CPU capacity (system_cpu_usage aggregates all cores)
        cpuPct = (deltaContainer / (systemNs - prev.systemNs)) * 100
      } else if (wallMs > prev.wallMs) {
        cpuPct =
          (deltaContainer / ((wallMs - prev.wallMs) * 1e6 * onlineCpus)) * 100
      }
      if (cpuPct !== null) cpuPct = Math.min(100, Math.max(0, cpuPct))
    }
    prevCpuByContainer.set(id, { containerNs, systemNs, wallMs })

    let memUsed: number | null = stats.memory_stats?.usage ?? null
    const inactiveFile = stats.memory_stats?.stats?.inactive_file
    if (memUsed !== null && typeof inactiveFile === "number") {
      memUsed = Math.max(0, memUsed - inactiveFile)
    }

    return {
      id: id.slice(0, 12),
      name: nameFromContainer(c),
      icon: iconFromLabels(c.Labels ?? null),
      cpuPct,
      memUsed,
    }
  } catch {
    return null
  }
}

export async function sampleDockerContainers(): Promise<
  Array<ContainerSample>
> {
  let list: Array<any>
  try {
    list = await dockerGet("/containers/json")
  } catch {
    return [] // no socket mounted — system metrics still work
  }
  const samples = await Promise.all(list.map(sampleOne))
  const alive = new Set(list.map((c: any) => c.Id))
  for (const id of prevCpuByContainer.keys()) {
    if (!alive.has(id)) prevCpuByContainer.delete(id)
  }

  // Aggregate containers into apps (sum usage across a compose project).
  const apps = new Map<string, ContainerSample>()
  for (let i = 0; i < list.length; i++) {
    const s = samples[i]
    if (!s) continue
    const appKey = appKeyFromContainer(list[i])
    const id = appKey ?? s.id
    const existing = apps.get(id)
    if (!existing) {
      apps.set(id, {
        ...s,
        id,
        name: appKey ? prettifyAppKey(appKey) : s.name,
      })
      continue
    }
    if (s.cpuPct !== null) {
      existing.cpuPct = (existing.cpuPct ?? 0) + s.cpuPct
    }
    if (s.memUsed !== null) {
      existing.memUsed = (existing.memUsed ?? 0) + s.memUsed
    }
    existing.icon ??= s.icon
  }
  return [...apps.values()]
}
