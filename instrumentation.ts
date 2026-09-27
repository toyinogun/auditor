/**
 * Runs once when the server starts: opens `$DATA_DIR/auditor.db` and applies pending migrations
 * before the first request, then fails any document a restart interrupted and deletes leftover
 * temp uploads (spec 0006, AC-11). No model call happens here. `NEXT_RUNTIME` is read directly
 * (not via lib/env.ts) because Next inlines it at build time, which keeps SQLite out of any edge
 * bundle.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { getDb } = await import("./lib/db/client");
    const { failInterrupted } = await import("./lib/db/documents");
    const { uploadStore } = await import("./lib/ingest/deps");
    const { logEvent } = await import("./lib/log");
    const failed = failInterrupted(getDb());
    const tempFiles = await uploadStore().sweepTemp();
    logEvent({ event: "startup_sweep", failed, tempFiles });
  }
}
