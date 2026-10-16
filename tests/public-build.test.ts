import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, expect, test } from "vite-plus/test";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function publicProject() {
  const root = mkdtempSync(join(tmpdir(), "kawal-public-"));
  roots.push(root);
  mkdirSync(join(root, "pages/rancangan"), { recursive: true });
  mkdirSync(join(root, "dist/client/_void/pages/rancangan"), { recursive: true });
  for (const name of ["index", "rancangan/b"]) {
    writeFileSync(join(root, `pages/${name}.tsx`), "export default function Page() {}");
    mkdirSync(join(root, "dist/client/rancangan"), { recursive: true });
    writeFileSync(join(root, `dist/client/${name}.html`), "<html><body>Fixture</body></html>");
    writeFileSync(
      join(root, `dist/client/_void/pages/${name}.json`),
      JSON.stringify({ props: {}, errors: null }),
    );
  }
  return root;
}

const check = resolve("scripts/check-public-build.mjs");
test("accept a complete static export without backend routes", () => {
  expect(execFileSync(process.execPath, [check, publicProject()], { encoding: "utf8" })).toContain(
    "2 complete HTML/JSON pairs",
  );
});

test.each(["index.html", "_void/pages/rancangan/b.json"])(
  "reject an incomplete export: %s",
  (path) => {
    const root = publicProject();
    rmSync(join(root, "dist/client", path));
    expect(spawnSync(process.execPath, [check, root]).status).not.toBe(0);
  },
);

test("reject a prerender error even when Void exits successfully", () => {
  const root = publicProject();
  writeFileSync(
    join(root, "dist/client/_void/pages/index.json"),
    JSON.stringify({ props: {}, errors: ["Failed loader"] }),
  );
  expect(spawnSync(process.execPath, [check, root]).status).not.toBe(0);
});

test.each(["index", "rancangan/b"])("keep reports out of %s navigation data", (name) => {
  const root = publicProject();
  writeFileSync(
    join(root, `dist/client/_void/pages/${name}.json`),
    JSON.stringify({ props: { reports: [] }, errors: null }),
  );
  expect(spawnSync(process.execPath, [check, root]).status).not.toBe(0);
});

test("reject backend conventions in the static public target", () => {
  const root = publicProject();
  mkdirSync(join(root, "routes"));
  writeFileSync(join(root, "routes/healthz.ts"), "export const GET = () => new Response('ok');");
  expect(spawnSync(process.execPath, [check, root]).status).not.toBe(0);
});
