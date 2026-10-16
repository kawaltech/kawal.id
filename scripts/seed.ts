import { openDatabase, migrate } from "../app/lib/database.server.ts";

if (process.env.NODE_ENV === "production") {
  throw new Error("Do not seed test identities in production.");
}

const db = openDatabase();
try {
  migrate(db);
  db.transaction(() => {
    const user = db.prepare(
      "INSERT OR IGNORE INTO users (id, display_name, role) VALUES (?, ?, ?)",
    );
    const identity = db.prepare(
      "INSERT OR IGNORE INTO identities (issuer, subject, user_id) VALUES (?, ?, ?)",
    );
    for (const role of ["reader", "reviewer"]) {
      user.run(`fixture-${role}`, `Test ${role}`, role);
      identity.run("urn:kawal:local-test", role, `fixture-${role}`);
    }
  })();
  console.log("Local test identities are ready. No sign-in endpoint is enabled.");
} finally {
  db.close();
}
