import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, expect, test } from "vite-plus/test";

const check = resolve("scripts/check-public-changes.mjs");
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function repository() {
  const root = mkdtempSync(join(tmpdir(), "kawal-public-changes-"));
  roots.push(root);
  const git = (...args: string[]) =>
    execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" },
    }).trim();
  git("init", "--quiet");
  git("config", "user.name", "Fixture");
  git("config", "user.email", "fixture@example.test");
  const write = (path: string) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), "Fixture\n");
  };
  const commit = () => {
    git("add", ".");
    git("commit", "--quiet", "-m", "Fixture");
    return git("rev-parse", "HEAD");
  };
  const deploy = (before: string, after: string) =>
    execFileSync(process.execPath, [check, before, after], { cwd: root, encoding: "utf8" }).trim();
  write("README.md");
  return { root, write, commit, deploy };
}

test.each([
  { paths: ["docs/adr/0006.md", "docs/design/icon.svg", "CONTEXT.md"], expected: "false" },
  { paths: [".agents/README.md"], expected: "false" },
  { paths: ["docs/guide.md", "apps/public/pages/index.tsx"], expected: "true" },
  { paths: ["app/design/map.tsx"], expected: "true" },
  { paths: ["apps/public/README.md"], expected: "true" },
  { paths: ["app/design/README.md"], expected: "true" },
  { paths: ["apps/app/auth.ts"], expected: "true" },
  { paths: [".github/workflows/check.yml"], expected: "true" },
  { paths: ["scripts/build.mjs"], expected: "true" },
  { paths: ["config/Caddyfile"], expected: "true" },
  { paths: ["pnpm-lock.yaml"], expected: "true" },
  { paths: ["apps/public/pages/name\nwith-newline.tsx"], expected: "true" },
])("deployment=$expected for $paths", ({ paths, expected }) => {
  const repo = repository();
  const before = repo.commit();
  for (const path of paths) repo.write(path);
  expect(repo.deploy(before, repo.commit())).toBe(expected);
});

test("moving shared code into docs still requires deployment", () => {
  const repo = repository();
  repo.write("app/design/source.tsx");
  const before = repo.commit();
  mkdirSync(join(repo.root, "docs"));
  renameSync(join(repo.root, "app/design/source.tsx"), join(repo.root, "docs/source.md"));
  expect(repo.deploy(before, repo.commit())).toBe("true");
});

test("compare the complete push and allow pending code when only docs follow it", () => {
  const repo = repository();
  const before = repo.commit();
  repo.write("apps/public/pages/index.tsx");
  const code = repo.commit();
  repo.write("docs/guide.md");
  const docs = repo.commit();
  expect(repo.deploy(before, docs)).toBe("true");
  expect(repo.deploy(code, docs)).toBe("false");
  repo.write("app/design/map.tsx");
  expect(repo.deploy(code, repo.commit())).toBe("true");
});

test("unknown history and new branches require deployment; a known empty range does not", () => {
  const repo = repository();
  const after = repo.commit();
  for (const before of ["0".repeat(40), "1".repeat(40)]) {
    expect(repo.deploy(before, after)).toBe("true");
  }
  expect(repo.deploy(after, after)).toBe("false");
});
