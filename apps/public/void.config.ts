import { defineConfig } from "void/config";

export default defineConfig({
  output: "static",
  head: {
    title: "Kawal Asap · Tinjauan desain",
    htmlAttrs: { lang: "id" },
    meta: [{ name: "robots", content: "noindex" }],
  },
  routing: {
    isr: false,
    notFound: "none",
    headers: {
      "/*": ["Cache-Control: public, max-age=60, must-revalidate"],
      "/assets/*": ["Cache-Control: public, max-age=31536000, immutable"],
    },
  },
  worker: { compatibility_date: "2026-10-16" },
  cloudflare: {
    name: "kawal-asap-design-review",
    account_id: "1d60533bd63392b6dc25160f907c4f76",
    routes: [{ pattern: "kawal.id", custom_domain: true }],
    workers_dev: true,
    preview_urls: false,
  },
});
