import { voidReact } from "@void/react/plugin";
import { voidPlugin } from "void";
import { defineConfig } from "vite-plus";

export default defineConfig({
  plugins: [voidPlugin(), voidReact()],
  preview: { host: "127.0.0.1" },
});
