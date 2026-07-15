import { createServerFn } from "@tanstack/react-start"

export interface HistoryInput {
  fromSec: number
  toSec: number
}

function validateRange(input: unknown): HistoryInput {
  const { fromSec, toSec } = input as HistoryInput
  if (
    typeof fromSec !== "number" ||
    typeof toSec !== "number" ||
    fromSec >= toSec
  ) {
    throw new Error("invalid time range")
  }
  return { fromSec: Math.floor(fromSec), toSec: Math.floor(toSec) }
}

export const fetchSummary = createServerFn({ method: "GET" }).handler(
  async () => {
    const { ensureCollectorStarted } = await import("../server/collector")
    const { getSummary } = await import("../server/queries")
    ensureCollectorStarted()
    return getSummary()
  }
)

export const fetchSystemHistory = createServerFn({ method: "GET" })
  .validator(validateRange)
  .handler(async ({ data }) => {
    const { getSystemHistory } = await import("../server/queries")
    return getSystemHistory(data.fromSec, data.toSec)
  })

export const fetchContainerHistory = createServerFn({ method: "GET" })
  .validator(validateRange)
  .handler(async ({ data }) => {
    const { getContainerHistory } = await import("../server/queries")
    return getContainerHistory(data.fromSec, data.toSec)
  })
