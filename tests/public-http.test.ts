import { execFile } from "node:child_process";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { expect, test } from "vite-plus/test";

test("accept the active deployment but reject an older Worker version", async () => {
  const version = "11111111-1111-4111-8111-111111111111";
  const server = createServer((request, response) => {
    const path = request.url!;
    if (path === "/__void/ready") {
      response.setHeader("Cache-Control", "no-store");
      response.end(JSON.stringify({ ready: true, versionId: version }));
      return;
    }
    response.setHeader("Cache-Control", "public, max-age=60, must-revalidate");
    if (path === "/assets/test.js") {
      response.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      response.end("// Fixture");
      return;
    }
    const names = ["index", "rancangan", "rancangan/a", "rancangan/b", "rancangan/c"];
    const name = path.startsWith("/_void/pages/")
      ? path.slice("/_void/pages/".length).replace(/\.json$/, "")
      : path.slice(1) || "index";
    if (!names.includes(name)) {
      response.writeHead(404).end();
      return;
    }
    const hasReports = name === "rancangan/a" || name === "rancangan/c";
    response.end(
      path.startsWith("/_void/pages/")
        ? JSON.stringify({ props: hasReports ? { reports: [{}, {}] } : {}, errors: null })
        : `<html><meta name="robots" content="noindex"><script src="/assets/test.js"></script>${hasReports ? "laporan-contoh-fixture" : ""}</html>`,
    );
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  try {
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const check = resolve("scripts/check-public.mjs");
    const run = promisify(execFile);
    await expect(run(process.execPath, [check, base, version])).resolves.toMatchObject({
      stdout: expect.stringContaining("Public HTTP checks passed"),
    });
    await expect(
      run(process.execPath, [check, base, "22222222-2222-4222-8222-222222222222"]),
    ).rejects.toThrow("versionId");
  } finally {
    await new Promise<void>((done, fail) =>
      server.close((error) => (error ? fail(error) : done())),
    );
  }
});
