import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, test, vi } from "vite-plus/test";
import TanyaReview from "../apps/public/pages/rancangan/tanya";

afterEach(() => vi.unstubAllEnvs());

test("keep the local widget preview disabled in production", () => {
  vi.stubEnv("DEV", false);
  const html = renderToStaticMarkup(createElement(TanyaReview));
  expect(html).toContain("Pratinjau interaksi hanya tersedia di server pengembangan lokal.");
  expect(html).not.toMatch(/<button|<dialog|<iframe|<script|<form/);
});

test("show a local privacy warning without a remote service or submission control", () => {
  vi.stubEnv("DEV", true);
  const html = renderToStaticMarkup(createElement(TanyaReview));
  expect(html).toContain("riwayat publik");
  expect(html).toContain("bukan berarti anonim");
  expect(html).toContain("Login dan pengiriman pertanyaan dinonaktifkan");
  expect(html).toContain('aria-haspopup="dialog"');
  expect(html).not.toMatch(/<iframe|<script|<form|<input|<textarea|https?:\/\//);
});
