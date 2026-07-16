-- IF NOT EXISTS makes this a safe baseline: fresh DBs get the tables, while
-- DBs created by the earlier raw-SQL version (identical shape) treat it as a
-- no-op and simply record the migration as applied.
CREATE TABLE IF NOT EXISTS `container_samples` (
	`ts` integer NOT NULL,
	`container_id` text NOT NULL,
	`cpu_pct` real,
	`mem_used` integer
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_container_ts` ON `container_samples` (`ts`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_container_id_ts` ON `container_samples` (`container_id`,`ts`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `containers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`icon` text,
	`last_seen` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `system_samples` (
	`ts` integer NOT NULL,
	`cpu_pct` real,
	`mem_used` integer,
	`mem_total` integer,
	`temp_c` real,
	`power_w` real,
	`net_rx` real,
	`net_tx` real
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_system_ts` ON `system_samples` (`ts`);
