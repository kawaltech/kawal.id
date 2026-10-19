import { defineConfig } from "vite-plus";

export default defineConfig({
  lint: {
    // templates/ holds a user-supplied design file and its generated runtime.
    ignorePatterns: ["templates/**"],
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
                    "**/design/scenario",
                    "**/design/scenario.*",
                    "**/design/incident*",
                    "**/design/indonesia*",
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
