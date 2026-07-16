import { mkdirSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { Database } from "bun:sqlite"
import { sql } from "drizzle-orm"
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite"
import { drizzle } from "drizzle-orm/bun-sqlite"
import { migrate } from "drizzle-orm/bun-sqlite/migrator"

import { config } from "./config"
import * as schema from "./schema"

export type DB = BunSQLiteDatabase<typeof schema>

declare global {
  var __zimaStatsDb: DB | undefined
}

export function getDb(): DB {
  if (globalThis.__zimaStatsDb) return globalThis.__zimaStatsDb

  mkdirSync(dirname(config.dbPath), { recursive: true })
  const sqlite = new Database(config.dbPath, { create: true })
  // WAL + NORMAL is the standard embedded-write profile: concurrent reads,
  // durable enough, far fewer fsyncs than the default.
  sqlite.exec("PRAGMA journal_mode = WAL")
  sqlite.exec("PRAGMA synchronous = NORMAL")

  const db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder: resolve(process.cwd(), "drizzle") })
  cleanupLegacyContainerRows(db)

  globalThis.__zimaStatsDb = db
  return db
}

// Container rows were once keyed by 12-hex Docker container ids; they are now
// keyed by compose-project (app) ids. Drop any stragglers so a stale per-app
// db container doesn't linger in the list.
function cleanupLegacyContainerRows(db: DB) {
  const hexId = "[0-9a-f]".repeat(12)
  db.run(sql`DELETE FROM containers WHERE id GLOB ${hexId}`)
  db.run(sql`DELETE FROM container_samples WHERE container_id GLOB ${hexId}`)
}
