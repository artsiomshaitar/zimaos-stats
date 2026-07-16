import { ensureCollectorStarted } from "./collector"
import { getContainerHistory, getSummary, getSystemHistory } from "./queries"

export type ApiResult =
  | { kind: "json"; data: unknown }
  | { kind: "bad-request" }
  | { kind: "not-found" }

/**
 * Shared `/api` routing used by both the production server (serve.ts) and the
 * vite dev middleware, so data behaves identically in dev and prod.
 */
export function handleApi(pathname: string, params: URLSearchParams): ApiResult {
  ensureCollectorStarted()
  if (pathname === "/api/summary") return { kind: "json", data: getSummary() }

  const from = Number(params.get("from"))
  const to = Number(params.get("to"))
  const ok = Number.isFinite(from) && Number.isFinite(to) && from < to
  if (pathname === "/api/system") {
    return ok
      ? { kind: "json", data: getSystemHistory(Math.floor(from), Math.floor(to)) }
      : { kind: "bad-request" }
  }
  if (pathname === "/api/containers") {
    return ok
      ? {
          kind: "json",
          data: getContainerHistory(Math.floor(from), Math.floor(to)),
        }
      : { kind: "bad-request" }
  }
  return { kind: "not-found" }
}
