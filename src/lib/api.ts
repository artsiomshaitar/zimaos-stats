import type { ContainerSeries, Summary, SystemPoint } from "@/server/queries"

// The client fetches data over plain HTTP from the server's /api endpoints
// (see serve.ts). Keeping this a thin fetch layer — not framework server
// functions — is what lets the server stay tiny: it never loads React SSR.
export interface HistoryInput {
  fromSec: number
  toSec: number
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url} → ${res.status}`)
  return res.json() as Promise<T>
}

export function fetchSummary(): Promise<Summary> {
  return getJson<Summary>("/api/summary")
}

export function fetchSystemHistory({
  data,
}: {
  data: HistoryInput
}): Promise<Array<SystemPoint>> {
  return getJson(`/api/system?from=${data.fromSec}&to=${data.toSec}`)
}

export function fetchContainerHistory({
  data,
}: {
  data: HistoryInput
}): Promise<Array<ContainerSeries>> {
  return getJson(`/api/containers?from=${data.fromSec}&to=${data.toSec}`)
}
