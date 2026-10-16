import Database from "better-sqlite3";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { prepareStorage } from "./storage.server.ts";

export function openDatabase(directory?: string) {
  const paths = prepareStorage(directory);
  const db = new Database(paths.database, { timeout: 5000 });
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("synchronous = FULL");
  return db;
}

export function migrate(db: Database.Database, directory = resolve("migrations")) {
  // BEGIN IMMEDIATE serializes migration checks across overlapping containers.
  db.transaction(() => {
    db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      sql TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    ) STRICT`);
    const applied = db.prepare("SELECT sql FROM schema_migrations WHERE name = ?");
    const record = db.prepare("INSERT INTO schema_migrations (name, sql) VALUES (?, ?)");
    for (const name of readdirSync(directory)
      .filter((name) => name.endsWith(".sql"))
      .sort()) {
      const sql = readFileSync(join(directory, name), "utf8");
      const previous = applied.get(name) as { sql: string } | undefined;
      if (previous) {
        if (previous.sql !== sql) throw new Error(`Applied migration changed: ${name}`);
        continue;
      }
      db.exec(sql);
      record.run(name, sql);
    }
  }).immediate();
}
