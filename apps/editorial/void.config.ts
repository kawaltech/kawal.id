import { defineConfig } from "void/config";

export default defineConfig({
  output: "server",
  head: { title: "Kawal Asap · Editorial", meta: [{ name: "robots", content: "noindex" }] },
  routing: {
    isr: false,
    notFound: "none",
    headers: { "/*": ["Cache-Control: private, no-store"] },
  },
  worker: { compatibility_date: "2026-10-16" },
  cloudflare: {
    name: "kawal-asap-editorial",
    workers_dev: false,
    preview_urls: false,
  },
});
