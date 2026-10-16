import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Local, read-only gates for a manually approved app staging deployment.
// This script makes no network requests and never runs a deployment.
const usage = [
  "Usage:",
  "  node scripts/app-staging.mjs preflight <approved-commit> [repository-root]",
  "  node scripts/app-staging.mjs version <deploy-started-at-ms>",
].join("\n");

const staging = {
  account: "1d60533bd63392b6dc25160f907c4f76",
  worker: "kawal-asap-app",
  host: "app.kawal.id",
  database: "kawal-asap-app-db",
  bucket: "kawal-asap-app-storage",
  migrationsDir: "./db/migrations",
};
// Void's own real-ID test for D1 (provision-BuifYvLc.mjs:62, :67).
const realD1Id = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const [command, ...args] = process.argv.slice(2);
if (command === "preflight") await preflight(args[0], resolve(args[1] ?? "."));
else if (command === "version") deployedVersion(Number(args[0]));
else assert.fail(usage);

async function preflight(commit, root) {
  assert.match(commit ?? "", /^[0-9a-f]{40}$/, `Give the full approved commit SHA.\n${usage}`);
  const app = join(root, "apps/app");
  const git = (...gitArgs) => execFileSync("git", ["-C", root, ...gitArgs], { encoding: "utf8" });
  assert.equal(git("rev-parse", "HEAD").trim(), commit, "HEAD must be the approved commit");
  assert.equal(
    git("status", "--porcelain", "--untracked-files=normal"),
    "",
    "Commit all changes first",
  );

  const config = (await import(pathToFileURL(join(app, "void.config.ts")).href)).default;
  const cloudflare = config.cloudflare ?? {};
  assert.equal(config.output, "server", "app output");
  assert.equal(cloudflare.name, staging.worker, "Worker name");
  assert.equal(cloudflare.account_id, staging.account, "Pin the Cloudflare account");
  assert.deepEqual(cloudflare.routes, [{ pattern: staging.host, custom_domain: true }], "routes");
  assert.equal(cloudflare.workers_dev, false, "workers.dev must stay disabled");
  assert.equal(cloudflare.preview_urls, false, "preview URLs must stay disabled");
  assert.notEqual(config.deploy?.cloudflare?.mode, "atomic", "Use staged activation");
  assert.equal(config.routing?.isr, false, "ISR must stay disabled");
  const headers = config.routing?.headers?.["/*"] ?? [];
  assert.ok(headers.includes("Cache-Control: private, no-store"), "private, no-store header");
  assert.ok(headers.includes("X-Robots-Tag: noindex"), "noindex header");
  assert.ok(
    config.head?.meta?.some((meta) => meta.name === "robots" && meta.content === "noindex"),
    "noindex meta",
  );
  // Deliberate blocker: Void 1.1.11 enables D1 read replication whenever it provisions
  // (provision-BuifYvLc.mjs:1460-1472). Pinned real resources make deploy skip
  // provisioning (deploy-DsW-PrRQ.mjs:4743, :4790-4792). Fail until both are pinned.
  const blocker =
    "Pin the approved pre-created D1 database (read replication off) and R2 bucket " +
    "in void.config.ts. This blocker is deliberate until gates 3-5 are complete";
  assert.equal(cloudflare.d1_databases?.length, 1, `${blocker}: one D1 database`);
  const [d1] = cloudflare.d1_databases;
  assert.equal(d1.binding, "DB", `${blocker}: D1 binding DB`);
  assert.equal(d1.database_name, staging.database, `${blocker}: D1 name`);
  assert.ok(realD1Id.test(d1.database_id ?? ""), `${blocker}: real D1 database_id`);
  assert.equal(d1.migrations_dir, staging.migrationsDir, `${blocker}: exact D1 migrations_dir`);
  assert.equal(cloudflare.r2_buckets?.length, 1, `${blocker}: one R2 bucket`);
  assert.equal(cloudflare.r2_buckets[0].binding, "STORAGE", `${blocker}: R2 binding STORAGE`);
  assert.equal(cloudflare.r2_buckets[0].bucket_name, staging.bucket, `${blocker}: R2 bucket`);
  if (config.auth?.providers) {
    assert.deepEqual(config.auth.providers, ["google"], "Google must be the only provider");
  }
  assert.ok(existsSync(join(app, "auth.ts")), "apps/app/auth.ts must define Google-only sign-in");

  // Void 1.1.11 applies db/migrations/*.sql (except seed.sql) in filename order.
  const migrations = join(app, "db/migrations");
  const files = existsSync(migrations)
    ? readdirSync(migrations).filter((name) => name.endsWith(".sql") && name !== "seed.sql")
    : [];
  assert.ok(files.length > 0, "Commit the generated auth and reviewer migrations");
  const journal = JSON.parse(readFileSync(join(migrations, "meta/_journal.json"), "utf8"));
  assert.deepEqual(
    journal.entries.map((entry) => `${entry.tag}.sql`).sort(),
    [...files].sort(),
    "Each migration must have one journal entry",
  );
  const schema = files.map((name) => readFileSync(join(migrations, name), "utf8")).join("\n");
  const tables = ["user", "session", "account", "verification"];
  tables.push("reviewer_invitations", "reviewer_grants", "reviewer_audit_events");
  for (const table of tables) {
    assert.match(schema, new RegExp(`CREATE TABLE \`?${table}\`?`), `migration for ${table}`);
  }
  assert.ok(!existsSync(join(app, "db/migrations/0001-users.sql")), "Keep the root migration out");

  const built = join(app, "dist/ssr/wrangler.json");
  assert.ok(existsSync(built), "Run pnpm check before preflight");
  const worker = JSON.parse(readFileSync(built, "utf8"));
  assert.equal(worker.name, staging.worker, "built Worker name");
  assert.equal(worker.workers_dev, false, "built workers_dev");
  assert.equal(worker.preview_urls, false, "built preview_urls");
  const bundle = readdirSync(join(app, "dist/ssr"), { recursive: true })
    .filter((name) => String(name).endsWith(".js"))
    .map((name) => readFileSync(join(app, "dist/ssr", String(name)), "utf8"))
    .join("\n");
  assert.doesNotMatch(bundle, /test\/sign-in|AUTH_TEST_SIGN_IN/, "No test sign-in in the build");
  // Any other missing resource also starts provisioning, which enables D1 replication.
  assert.deepEqual(worker.kv_namespaces ?? [], [], "No KV binding: it would start provisioning");
  assert.deepEqual(worker.queues?.producers ?? [], [], "No queue: it would start provisioning");
  assert.deepEqual(worker.queues?.consumers ?? [], [], "No queue: it would start provisioning");
  assert.deepEqual(worker.hyperdrive ?? [], [], "No Hyperdrive: it would start provisioning");

  const lockPath = join(app, "void.lock.json");
  if (existsSync(lockPath)) {
    const resolved = JSON.parse(readFileSync(lockPath, "utf8")).resolved;
    assert.equal(resolved.name, staging.worker, "lock Worker");
    assert.equal(resolved.account_id, staging.account, "lock account");
    const d1 = resolved.d1_databases?.find((entry) => entry.binding === "DB");
    assert.equal(d1?.database_name, staging.database, "lock D1 name");
    assert.equal(d1?.database_id, cloudflare.d1_databases[0].database_id, "lock D1 ID");
    assert.equal(d1?.migrations_dir, staging.migrationsDir, "lock D1 migrations_dir");
    const r2 = resolved.r2_buckets?.find((entry) => entry.binding === "STORAGE");
    assert.equal(r2?.bucket_name, staging.bucket, "lock R2 bucket");
    console.log("Existing lock: it matches the pinned D1 database and R2 bucket.");
  } else {
    console.log(
      `First deployment: Void creates BETTER_AUTH_SECRET and publishes on https://${staging.host} ` +
        "before readiness. No previous version exists for rollback.",
    );
  }
  console.log(
    `Pinned D1 ${d1.database_id} and R2 ${staging.bucket}: deploy must skip provisioning. ` +
      "Never pass --provision.",
  );
  console.log(`App staging preflight passed for ${commit}. This is not deployment approval.`);
}

function deployedVersion(startedAt) {
  assert.ok(Number.isSafeInteger(startedAt) && startedAt > 0, usage);
  const dir = join(homedir(), ".void/logs");
  const records = readdirSync(dir)
    .filter((name) => name.startsWith("deploy-") && name.endsWith(".jsonl"))
    .flatMap((name) => readFileSync(join(dir, name), "utf8").trim().split("\n").filter(Boolean))
    .map((line) => JSON.parse(line));
  const results = records.filter(
    (record) =>
      record.ts >= startedAt &&
      record.msg === "cloudflare_deploy_end" &&
      record.ok === true &&
      record.worker === staging.worker,
  );
  assert.equal(results.length, 1, "Require one success record from this deployment");
  // deploy-DsW-PrRQ.mjs:4760 logs cloudflare_provisioned when provisioning ran.
  const provisioned = records.filter(
    (record) =>
      record.ts >= startedAt &&
      (record.msg === "cloudflare_provisioned" ||
        (record.msg === "cloudflare_deploy_start" && record.provision === true)),
  );
  assert.equal(provisioned.length, 0, "Provisioning ran: check D1 read replication now");
  assert.match(results[0].versionId, /^[0-9a-f-]{36}$/i, "Require the deployed Worker version ID");
  console.log(results[0].versionId);
}
