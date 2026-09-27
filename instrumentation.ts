/**
 * Runs once when the server starts: opens `$DATA_DIR/auditor.db` and applies pending migrations
 * before the first request. `NEXT_RUNTIME` is read directly (not via lib/env.ts) because Next
 * inlines it at build time, which keeps SQLite out of any edge bundle.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { getDb } = await import("./lib/db/client");
    getDb();
  }
}
