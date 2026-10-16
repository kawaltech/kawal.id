// Local reviewer administration. Run from apps/app with Node.js 24:
//
//   node scripts/reviewer-admin.ts bootstrap --email person@example.org
//   node scripts/reviewer-admin.ts invite --email person@example.org [--role admin]
//   node scripts/reviewer-admin.ts revoke --user <user id> [--reason text]
//   node scripts/reviewer-admin.ts revoke-invitation --id <invitation id>
//   node scripts/reviewer-admin.ts list
//
// Without --print-sql, the script changes only the local Miniflare D1 through
// `void db execute`. It refuses --remote. With --print-sql, it writes the SQL
// to stdout and changes nothing; an approved operator can review and apply it.
// Do not commit real email addresses or generated SQL.

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  invitationStatements,
  newId,
  revokeGrantStatements,
  revokeInvitationStatements,
  type ReviewerRole,
  type SqlStatement,
} from "../lib/reviewer-store.ts";

const LIST_SQL = `SELECT 'invitation' AS kind, id, email AS who, role, created_via AS via, created_at, expires_at,
  claimed_at, claimed_by_user_id AS user_id, revoked_at FROM reviewer_invitations
UNION ALL
SELECT 'grant', id, google_subject, role, invitation_id, granted_at, NULL, NULL, user_id, revoked_at FROM reviewer_grants
ORDER BY created_at`;

function fail(message: string): never {
  console.error(`reviewer-admin: ${message}`);
  process.exit(2);
}

function sqlLiteral(value: string | number | null): string {
  if (value === null) return "NULL";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail("A number is not finite.");
    return String(value);
  }
  return `'${value.replaceAll("'", "''")}'`;
}

/** Put parameter values into the SQL text, because `void db execute` has no parameters. */
export function inlineStatement(statement: SqlStatement): string {
  return `${statement.sql.replace(/\?(\d+)/g, (_, index: string) => {
    const position = Number(index) - 1;
    if (position < 0 || position >= statement.params.length) fail("A SQL parameter is missing.");
    return sqlLiteral(statement.params[position]);
  })};`;
}

function parseArgs(argv: string[]) {
  const [command, ...rest] = argv;
  const options = new Map<string, string | true>();
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (!arg.startsWith("--")) fail(`Unexpected argument '${arg}'.`);
    const name = arg.slice(2);
    if (name === "remote")
      fail("--remote is not supported. Use --print-sql and an approved procedure.");
    if (name === "print-sql") {
      options.set(name, true);
      continue;
    }
    const value = rest[++i];
    if (value === undefined || value.startsWith("--")) fail(`--${name} needs a value.`);
    options.set(name, value);
  }
  return { command, options };
}

function option(options: Map<string, string | true>, name: string, allowed: string[]) {
  for (const key of options.keys()) {
    if (key !== "print-sql" && !allowed.includes(key)) fail(`--${key} is not valid here.`);
  }
  const value = options.get(name);
  return typeof value === "string" ? value : undefined;
}

function required(value: string | undefined, name: string): string {
  if (!value) fail(`--${name} is necessary.`);
  return value;
}

function statementsFor(command: string | undefined, options: Map<string, string | true>) {
  const now = new Date();
  switch (command) {
    case "bootstrap":
    case "invite": {
      const email = required(option(options, "email", ["email", "role", "hours"]), "email");
      const role = (option(options, "role", ["email", "role", "hours"]) ??
        (command === "bootstrap" ? "admin" : "reviewer")) as ReviewerRole;
      const hours = option(options, "hours", ["email", "role", "hours"]);
      return invitationStatements({
        id: newId(),
        auditId: newId(),
        email,
        role,
        now,
        hours: hours === undefined ? undefined : Number(hours),
        source: { via: command === "bootstrap" ? "bootstrap" : "local" },
      });
    }
    case "revoke":
      return revokeGrantStatements({
        targetUserId: required(option(options, "user", ["user", "reason"]), "user"),
        actorUserId: null,
        reason: option(options, "reason", ["user", "reason"]) ?? "Local administrative revocation.",
        now,
        auditId: newId(),
      });
    case "revoke-invitation":
      return revokeInvitationStatements({
        invitationId: required(option(options, "id", ["id"]), "id"),
        actorUserId: null,
        now,
        auditId: newId(),
      });
    case "list":
      option(options, "", []);
      return null;
    default:
      fail("Use bootstrap, invite, revoke, revoke-invitation or list.");
  }
}

function executeLocal(sql: string) {
  const dir = mkdtempSync(join(tmpdir(), "reviewer-admin-"));
  try {
    const file = join(dir, "change.sql");
    writeFileSync(file, sql);
    const result = spawnSync("npx", ["void", "db", "execute", "--file", file], {
      stdio: "inherit",
    });
    if (result.status !== 0) process.exit(result.status ?? 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  let statements: SqlStatement[] | null;
  try {
    statements = statementsFor(command, options);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
  const printOnly = options.get("print-sql") === true;
  if (statements === null) {
    if (printOnly) console.log(`${LIST_SQL};`);
    else executeLocal(LIST_SQL);
    return;
  }
  const body = statements.map(inlineStatement).join("\n");
  if (printOnly) {
    // D1 rejects BEGIN and COMMIT. Each guarded statement checks its own
    // conditions, so a partial run cannot create a second open invitation.
    console.log(body);
    return;
  }
  executeLocal(`BEGIN IMMEDIATE;\n${body}\nCOMMIT;`);
  executeLocal(LIST_SQL);
}

if (import.meta.main) main();
