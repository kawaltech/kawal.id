import { fileURLToPath } from "node:url";
import { voidReact } from "@void/react/plugin";
import { voidPlugin } from "void";
import { defineConfig } from "vite-plus";

export default defineConfig({
  plugins: [voidPlugin(), voidReact()],
  resolve: { alias: { "~": fileURLToPath(new URL("../../app", import.meta.url)) } },
  preview: { host: "127.0.0.1" },
});
