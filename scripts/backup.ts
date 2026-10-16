import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { openDatabase } from "../app/lib/database.server.ts";

const destination = process.argv[2];
if (!destination) throw new Error("Specify a new backup path: pnpm db:backup /path/backup.sqlite");
if (existsSync(destination)) throw new Error("The backup path must not exist.");

const db = openDatabase();
try {
  await db.backup(resolve(destination));
  console.log("SQLite backup is complete. Back up referenced media separately.");
} finally {
  db.close();
}
