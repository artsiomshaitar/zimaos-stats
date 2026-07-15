const FALLBACK = "ZimaOS"

/** "t800" -> "T800", "living-room" -> "Living-Room" */
function titleize(label: string): string {
  return label
    .split("-")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join("-")
}

/**
 * Device name for the heading and tab title. A DEVICE_NAME env var (surfaced
 * via the summary) wins; otherwise we derive it from the hostname the browser
 * connected to — "t800.local" -> "T800" — which needs no host mount or config.
 */
export function resolveDeviceName(envName: string | null): string {
  if (envName) return envName
  if (typeof window === "undefined") return FALLBACK
  const host = window.location.hostname
  if (
    !host ||
    host === "localhost" ||
    /^[\d.]+$/.test(host) ||
    host.includes(":")
  ) {
    return FALLBACK
  }
  return titleize(host.replace(/\.local$/i, "").split(".")[0])
}
