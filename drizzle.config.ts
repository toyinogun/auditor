import { defineConfig } from "drizzle-kit";

// Generates SQL migrations into drizzle/ from the schema; lib/db/client.ts applies them.
export default defineConfig({
  dialect: "sqlite",
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
});
