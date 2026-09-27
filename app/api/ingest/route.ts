import { getDb } from "@/lib/db/client";
import { env } from "@/lib/env";
import { ingestDeps } from "@/lib/ingest/deps";
import { handleIngestRequest } from "@/lib/ingest/webhook";

/** The n8n intake webhook (spec 0006, AC-3). Node runtime: SQLite, the file system and the SDK. */
export const runtime = "nodejs";

export const POST = (request: Request): Promise<Response> =>
  handleIngestRequest(request, {
    demoMode: env.DEMO_MODE,
    secret: env.INGEST_SECRET,
    db: getDb,
    deps: ingestDeps,
    clock: Date.now,
  });
