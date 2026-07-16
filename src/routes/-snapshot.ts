import {
  fetchContainerHistory,
  fetchSummary,
  fetchSystemHistory,
} from "@/lib/api"
import { rangeByKey } from "@/lib/ranges"
import type { ContainerSeries, Summary, SystemPoint } from "@/server/queries"

export interface Snapshot {
  now: number
  summary: Summary
  system: Array<SystemPoint>
  containers: Array<ContainerSeries>
}

export async function loadSnapshot(rangeKey: string): Promise<Snapshot> {
  const now = Math.floor(Date.now() / 1000)
  const range = rangeByKey(rangeKey)
  const summary = await fetchSummary()
  const [system, containers] = await Promise.all([
    fetchSystemHistory({ data: { fromSec: now - range.seconds, toSec: now } }),
    fetchContainerHistory({
      data: { fromSec: now - range.seconds, toSec: now },
    }),
  ])
  return { now, summary, system, containers }
}
