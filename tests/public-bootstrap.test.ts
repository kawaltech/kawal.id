import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, expect, test } from "vite-plus/test";

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

test("bootstrap exposes a complete export, survives a mount change, and never replaces active content", () => {
  const directory = mkdtempSync(join(tmpdir(), "kawal-public-"));
  directories.push(directory);
  mkdirSync(join(directory, "build/client"), { recursive: true });
  writeFileSync(join(directory, "build/client/index.html"), "Complete initial export");
  const options = { cwd: directory, env: { ...process.env, DATA_DIR: join(directory, "data") } };
  execFileSync(process.execPath, [resolve("scripts/init-public.mjs")], options);
  writeFileSync(join(directory, "build/client/index.html"), "Do not replace the active export");
  execFileSync(process.execPath, [resolve("scripts/init-public.mjs")], options);
  expect(readFileSync(join(directory, "data/public/current/index.html"), "utf8")).toBe(
    "Complete initial export",
  );
  cpSync(join(directory, "data/public"), join(directory, "mount"), {
    recursive: true,
    verbatimSymlinks: true,
  });
  rmSync(join(directory, "data/public"), { recursive: true });
  expect(readFileSync(join(directory, "mount/current/index.html"), "utf8")).toBe(
    "Complete initial export",
  );
});

test("a failed bootstrap exposes no incomplete export", () => {
  const directory = mkdtempSync(join(tmpdir(), "kawal-public-"));
  directories.push(directory);
  expect(() =>
    execFileSync(process.execPath, [resolve("scripts/init-public.mjs")], {
      cwd: directory,
      env: { ...process.env, DATA_DIR: join(directory, "data") },
      stdio: "pipe",
    }),
  ).toThrow();
  expect(existsSync(join(directory, "data/public/current"))).toBe(false);
});
