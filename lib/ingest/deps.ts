import "server-only";
import path from "node:path";
import { env } from "@/lib/env";
import { createModelClient } from "@/lib/extract/client";
import { extractDocument } from "@/lib/extract/extract";
import { BYTES_PER_MB } from "./detect";
import { createUploadStore, type UploadStore } from "./files";
import type { IngestDeps } from "./ingest";

/** Where uploaded files live: `${DATA_DIR}/uploads/` (spec 0006). */
export const UPLOADS_DIR = path.join(env.DATA_DIR, "uploads");

export const uploadStore = (): UploadStore => createUploadStore(UPLOADS_DIR);

/** The real deps: config from lib/env.ts and the one model client (spec 0005). */
export const ingestDeps = (): IngestDeps => {
  const client = createModelClient();
  return {
    extract: (input) => extractDocument(input, client),
    files: uploadStore(),
    demoMode: env.DEMO_MODE,
    maxUploadBytes: env.MAX_UPLOAD_MB * BYTES_PER_MB,
    clock: Date.now,
  };
};
