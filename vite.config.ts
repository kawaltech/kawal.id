import { defineConfig } from "vite-plus";

export default defineConfig({
  lint: {
    options: { typeAware: true, typeCheck: true },
    overrides: [
      {
        files: ["apps/app/**/*.ts", "apps/app/**/*.tsx"],
        rules: {
          "no-restricted-imports": [
            "error",
            {
              patterns: [
                {
                  group: [
                    "**/design/fixture",
                    "**/design/fixture.*",
                    "**/design/detections",
                    "**/design/detections.*",
                    "**/design/ui",
                    "**/design/ui.*",
                  ],
                  message:
                    "The private app must not import synthetic design data or fixture-coupled UI. Reuse app/design/kawal.css and fixture-free components.",
                },
              ],
            },
          ],
        },
      },
    ],
  },
  test: { include: ["tests/**/*.test.ts"] },
});
