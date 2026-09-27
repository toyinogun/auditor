import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Mirror the "@/*" path alias from tsconfig.json.
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    // lib/ is plain server side TypeScript; no DOM needed yet.
    environment: "node",
    // Tests live beside the source they cover.
    include: ["**/*.test.ts"],
    exclude: [
      "node_modules/**",
      ".next/**",
      "data/**",
      ".agents/**",
      ".claude/**",
    ],
    // lib/ is still empty; lets the runner exit clean until the first test lands.
    passWithNoTests: true,
  },
});
