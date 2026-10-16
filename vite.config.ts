import { reactRouter } from "@react-router/dev/vite";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite-plus";

export default defineConfig({
  plugins: process.env.VITEST ? [] : [reactRouter()],
  resolve: { alias: { "~": fileURLToPath(new URL("./app", import.meta.url)) } },
  // Prerender requests and the preview listener must use the same address family.
  preview: { host: "127.0.0.1" },
  test: { include: ["tests/**/*.test.ts"] },
});
