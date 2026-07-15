import { mkdirSync } from "node:fs"
import { dirname } from "node:path"
import { DatabaseSync } from "node:sqlite"

import { config } from "./config"

const SCHEMA = `
CREATE TABLE IF NOT EXISTS system_samples (
  ts INTEGER NOT NULL,
  cpu_pct REAL,
  mem_used INTEGER,
  mem_total INTEGER,
  temp_c REAL,
  power_w REAL
);
CREATE INDEX IF NOT EXISTS idx_system_ts ON system_samples (ts);

CREATE TABLE IF NOT EXISTS container_samples (
  ts INTEGER NOT NULL,
  container_id TEXT NOT NULL,
  cpu_pct REAL,
  mem_used INTEGER
);
CREATE INDEX IF NOT EXISTS idx_container_ts ON container_samples (ts);
CREATE INDEX IF NOT EXISTS idx_container_id_ts ON container_samples (container_id, ts);

CREATE TABLE IF NOT EXISTS containers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT,
  last_seen INTEGER NOT NULL
);
`

declare global {
  var __zimaStatsDb: DatabaseSync | undefined
}

export function getDb(): DatabaseSync {
  if (globalThis.__zimaStatsDb) return globalThis.__zimaStatsDb
  mkdirSync(dirname(config.dbPath), { recursive: true })
  const db = new DatabaseSync(config.dbPath)
  db.exec("PRAGMA journal_mode = WAL")
  db.exec("PRAGMA synchronous = NORMAL")
  db.exec(SCHEMA)
  globalThis.__zimaStatsDb = db
  return db
}
