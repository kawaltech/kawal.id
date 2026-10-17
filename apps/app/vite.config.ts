import { fileURLToPath } from "node:url";
import { voidReact } from "@void/react/plugin";
import { voidPlugin } from "void";
import { defineConfig } from "vite-plus";

export default defineConfig(({ command }) => {
  if (command === "build" && process.env.NODE_ENV !== "production") {
    throw new Error("App builds require NODE_ENV=production.");
  }
  return {
    plugins: [voidPlugin(), voidReact()],
    // Shared design code. The app imports only the stylesheet: the design
    // components import synthetic fixtures that do not belong in app assets.
    resolve: { alias: { "~": fileURLToPath(new URL("../../app", import.meta.url)) } },
    preview: { host: "127.0.0.1" },
  };
});
