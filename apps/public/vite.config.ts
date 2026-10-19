import { fileURLToPath } from "node:url";
import { voidReact } from "@void/react/plugin";
import { voidPlugin } from "void";
import { defineConfig } from "vite-plus";

import { localSeedPreview } from "../../scripts/seed/preview.ts";

export default defineConfig({
  // localSeedPreview runs only in the development server; the build has no seed data.
  plugins: [localSeedPreview(), voidPlugin(), voidReact()],
  resolve: { alias: { "~": fileURLToPath(new URL("../../app", import.meta.url)) } },
  preview: { host: "127.0.0.1" },
});
