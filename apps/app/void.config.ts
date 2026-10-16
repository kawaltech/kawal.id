import { defineConfig } from "void/config";

export default defineConfig({
  output: "server",
  head: {
    title: "Kawal Asap · App",
    htmlAttrs: { lang: "en" },
    meta: [
      { charset: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "robots", content: "noindex" },
    ],
  },
  routing: {
    isr: false,
    notFound: "none",
    headers: { "/*": ["Cache-Control: private, no-store", "X-Robots-Tag: noindex"] },
  },
  worker: { compatibility_date: "2026-10-16" },
  cloudflare: {
    name: "kawal-app",
    account_id: "1d60533bd63392b6dc25160f907c4f76",
    d1_databases: [
      {
        binding: "DB",
        database_name: "kawal-app-db",
        database_id: "8f362e20-3ba6-468d-8681-ed0fb9f597ee",
        migrations_dir: "./db/migrations",
      },
    ],
    r2_buckets: [{ binding: "STORAGE", bucket_name: "kawal-app-storage" }],
    routes: [{ pattern: "app.kawal.id", custom_domain: true }],
    workers_dev: false,
    preview_urls: false,
  },
});
