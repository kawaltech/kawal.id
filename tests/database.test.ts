import Database from "better-sqlite3";
import { execFile } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach, expect, test } from "vite-plus/test";
import { openDatabase, migrate } from "../app/lib/database.server.ts";
import { dataPaths } from "../app/lib/storage.server.ts";

const exec = promisify(execFile);
const directories: string[] = [];
function temporary() {
  const directory = mkdtempSync(join(tmpdir(), "kawal-db-"));
  directories.push(directory);
  return directory;
}
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

test("parallel migrations and repeated setup preserve independent local data", async () => {
  const directory = temporary();
  const env = { ...process.env, DATA_DIR: directory, NODE_ENV: "test" };
  await Promise.all([0, 1].map(() => exec(process.execPath, ["scripts/migrate.ts"], { env })));
  await exec(process.execPath, ["scripts/seed.ts"], { env });
  const db = openDatabase(directory);
  try {
    db.prepare(
      "UPDATE users SET role = 'reader', disabled_at = '2026-01-01' WHERE id = 'fixture-reviewer'",
    ).run();
    await exec(process.execPath, ["scripts/seed.ts"], { env });
    expect(
      db.prepare("SELECT role, disabled_at FROM users WHERE id = 'fixture-reviewer'").get(),
    ).toEqual({ role: "reader", disabled_at: "2026-01-01" });
    expect(db.prepare("SELECT count(*) AS total FROM users").get()).toEqual({ total: 2 });
    expect(db.pragma("journal_mode", { simple: true })).toBe("wal");
    expect(db.pragma("busy_timeout", { simple: true })).toBe(5000);
    expect(() =>
      db.prepare("INSERT INTO identities VALUES ('google', 'sub', 'missing')").run(),
    ).toThrow();
    const other = openDatabase(temporary());
    try {
      migrate(other);
      expect(other.prepare("SELECT count(*) AS total FROM users").get()).toEqual({ total: 0 });
    } finally {
      other.close();
    }
  } finally {
    db.close();
  }
});

test("a failed migration leaves the old schema and records intact", () => {
  const directory = temporary();
  const migrations = join(directory, "migrations");
  cpSync(resolve("migrations"), migrations, { recursive: true });
  const db = openDatabase(directory);
  try {
    migrate(db, migrations);
    db.prepare("INSERT INTO users (id, display_name) VALUES ('kept', 'Keep this user')").run();
    writeFileSync(
      join(migrations, "0002-invalid.sql"),
      "CREATE TABLE partial (id TEXT); INVALID SQL;",
    );
    expect(() => migrate(db, migrations)).toThrow();
    expect(db.prepare("SELECT display_name FROM users WHERE id = 'kept'").get()).toEqual({
      display_name: "Keep this user",
    });
    expect(
      db.prepare("SELECT name FROM sqlite_master WHERE name = 'partial'").get(),
    ).toBeUndefined();
    expect(db.prepare("SELECT count(*) AS total FROM schema_migrations").get()).toEqual({
      total: 1,
    });
    writeFileSync(join(migrations, "0001-users.sql"), "CREATE TABLE replaced (id TEXT);");
    expect(() => migrate(db, migrations)).toThrow("Applied migration changed");
  } finally {
    db.close();
  }
});

test("the backup command restores committed WAL data without changing the source", async () => {
  const directory = temporary();
  const db = openDatabase(directory);
  const backup = join(directory, "backup.sqlite");
  try {
    migrate(db);
    db.prepare("INSERT INTO users (id, display_name) VALUES ('saved', 'A saved user')").run();
    await exec(process.execPath, ["scripts/backup.ts", backup], {
      env: { ...process.env, DATA_DIR: directory },
    });
    const restored = new Database(backup);
    try {
      expect(restored.pragma("integrity_check", { simple: true })).toBe("ok");
      expect(restored.prepare("SELECT display_name FROM users WHERE id = 'saved'").get()).toEqual({
        display_name: "A saved user",
      });
    } finally {
      restored.close();
    }
    expect(dataPaths(directory).originals.startsWith(dataPaths(directory).public)).toBe(false);
  } finally {
    db.close();
  }
});

test("production cannot seed test identities", async () => {
  const directory = temporary();
  await expect(
    exec(process.execPath, ["scripts/seed.ts"], {
      env: { ...process.env, DATA_DIR: directory, NODE_ENV: "production" },
    }),
  ).rejects.toThrow();
});
