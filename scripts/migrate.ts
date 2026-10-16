import { openDatabase, migrate } from "../app/lib/database.server.ts";

const db = openDatabase();
try {
  migrate(db);
  console.log("Database migrations are current.");
} finally {
  db.close();
}
