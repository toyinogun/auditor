import "server-only";
import { resetAll } from "@/lib/db/admin";
import { logEvent } from "@/lib/log";
import { err, ok, type Result } from "@/lib/schemas/result";
import type { Db } from "@/lib/db/client";
import { BRIEF_SAMPLE } from "@/lib/schemas/fixtures/brief-sample";
import { briefSampleRecords } from "@/lib/schemas/fixtures/brief-sample-records";
import type { UploadStore } from "@/lib/ingest/files";
import { SampleManifest } from "@/lib/schemas/sample-manifest";
import manifestJson from "@/public/sample/manifest.json";
import { runAudit, type AuditRunResult } from "./run";
import {
  saveAuditInput,
  storeManifestDocuments,
  type ManifestFiles,
} from "./store";

/** The committed `public/sample/manifest.json`; a file that fails the schema is a bug, so it throws. */
export const SAMPLE_MANIFEST: SampleManifest =
  SampleManifest.parse(manifestJson);

/**
 * The offline audit (Feature 6): clears everything, loads the brief sample from its structured
 * copy (no model call, no API key), runs the checks and stores the findings. All in one
 * transaction, so running it again replaces the run, and a failure leaves the old data intact.
 *
 * The `lib/db` functions called inside open their own `db.transaction` on the same connection.
 * That nests safely: better-sqlite3 sees the open transaction and runs each inner one as a
 * savepoint, so any throw still rolls back everything. Keep passing `db`, and keep the driver.
 */
export const runSampleAudit = (
  db: Db,
  clock: () => number = Date.now,
  manifest: ManifestFiles = SAMPLE_MANIFEST,
): AuditRunResult =>
  db.transaction(() => {
    const now = clock();
    resetAll(db);
    const refFor = storeManifestDocuments(db, manifest, now);
    saveAuditInput(
      db,
      briefSampleRecords(refFor),
      {
        receipts: refFor(BRIEF_SAMPLE.receipts.filename),
        payments: refFor(BRIEF_SAMPLE.payments.filename),
      },
      now,
    );
    return runAudit(db, clock);
  });

/**
 * The clean start (spec 0006, AC-14): `runSampleAudit`, then empties the uploads folder once its
 * transaction has committed. A load that throws leaves the files in place. `pnpm audit:sample`
 * and Load sample data (Feature 10) call this.
 */
export const loadSample = async (
  db: Db,
  files: Pick<UploadStore, "clear">,
  clock: () => number = Date.now,
  manifest: ManifestFiles = SAMPLE_MANIFEST,
): Promise<AuditRunResult> => {
  const run = runSampleAudit(db, clock, manifest);
  await files.clear();
  return run;
};

export type SampleLoaded = {
  readonly findingCount: number;
  readonly recoverableCents: number;
};

export const SAMPLE_LOAD_FAILED = "could not load the sample data, try again";

/**
 * Load sample data (spec 0007, AC-12): `loadSample` for the app bar button, with a thrown load
 * caught here and returned as an error, never a model call. Logs one `sample_loaded` event.
 */
export const loadSampleData = async (
  db: Db,
  files: Pick<UploadStore, "clear">,
  clock: () => number = Date.now,
  manifest: ManifestFiles = SAMPLE_MANIFEST,
): Promise<Result<SampleLoaded>> => {
  try {
    const { summary } = await loadSample(db, files, clock, manifest);
    logEvent({
      event: "sample_loaded",
      outcome: "ok",
      findingCount: summary.findingCount,
    });
    return ok({
      findingCount: summary.findingCount,
      recoverableCents: summary.recoverableCents,
    });
  } catch (error) {
    logEvent({
      event: "sample_loaded",
      outcome: "failed",
      findingCount: null,
      error: error instanceof Error ? error.name : "unknown",
    });
    return err(SAMPLE_LOAD_FAILED);
  }
};
