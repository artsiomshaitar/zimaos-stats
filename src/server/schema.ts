import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core"

/** Host-wide metrics, one row per poll. */
export const systemSamples = sqliteTable(
  "system_samples",
  {
    ts: integer("ts").notNull(),
    cpuPct: real("cpu_pct"),
    memUsed: integer("mem_used"),
    memTotal: integer("mem_total"),
    tempC: real("temp_c"),
    powerW: real("power_w"),
    netRx: real("net_rx"),
    netTx: real("net_tx"),
  },
  (t) => [index("idx_system_ts").on(t.ts)],
)

/** Per-app (compose-project) usage, one row per app per poll. */
export const containerSamples = sqliteTable(
  "container_samples",
  {
    ts: integer("ts").notNull(),
    containerId: text("container_id").notNull(),
    cpuPct: real("cpu_pct"),
    memUsed: integer("mem_used"),
  },
  (t) => [
    index("idx_container_ts").on(t.ts),
    index("idx_container_id_ts").on(t.containerId, t.ts),
  ],
)

/** App metadata (name/icon), keyed by compose-project id. */
export const containers = sqliteTable("containers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  icon: text("icon"),
  lastSeen: integer("last_seen").notNull(),
})
