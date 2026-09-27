import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Mirror the "@/*" path alias from tsconfig.json.
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
      // Next resolves server-only to an empty module on the server; mirror that in tests.
      "server-only": fileURLToPath(
        new URL("./node_modules/server-only/empty.js", import.meta.url),
      ),
    },
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
  },
});
