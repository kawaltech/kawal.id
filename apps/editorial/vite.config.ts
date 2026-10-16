import { voidReact } from "@void/react/plugin";
import { voidPlugin } from "void";
import { defineConfig } from "vite-plus";

export default defineConfig(({ command }) => {
  if (command === "build" && process.env.NODE_ENV !== "production") {
    throw new Error("Editorial builds require NODE_ENV=production.");
  }
  return {
    plugins: [voidPlugin(), voidReact()],
    preview: { host: "127.0.0.1" },
  };
});
