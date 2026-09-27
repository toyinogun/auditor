import "server-only";
import { resetAll } from "@/lib/db/admin";
import type { Db } from "@/lib/db/client";
import { insertDocument } from "@/lib/db/documents";
import {
  saveContract,
  saveInvoice,
  savePayments,
  savePurchaseOrder,
  saveReceipts,
} from "@/lib/db/records";
import { BRIEF_SAMPLE } from "@/lib/schemas/fixtures/brief-sample";
import { briefSampleRecords } from "@/lib/schemas/fixtures/brief-sample-records";
import type { DocumentRef } from "@/lib/schemas/records";
import type { Result } from "@/lib/schemas/result";
import { SampleManifest } from "@/lib/schemas/sample-manifest";
import manifestJson from "@/public/sample/manifest.json";
import { runAudit, type AuditRunResult } from "./run";

/** The committed `public/sample/manifest.json`; a file that fails the schema is a bug, so it throws. */
export const SAMPLE_MANIFEST: SampleManifest =
  SampleManifest.parse(manifestJson);

type ManifestFiles = Pick<SampleManifest, "files">;

/** A save that fails on the committed sample is a bug in the sample, so it throws. */
const orThrow = <T>(what: string, result: Result<T>): T => {
  if (!result.ok) throw new Error(`sample ${what}: ${result.error}`);
  return result.value;
};

/** Stores one document per manifest file, with its real hash, and returns a ref lookup. */
const storeDocuments = (
  db: Db,
  manifest: ManifestFiles,
  now: number,
): ((filename: string) => DocumentRef) => {
  const refs = new Map(
    manifest.files.map((file) => {
      const { document } = insertDocument(
        db,
        {
          sha256: file.sha256,
          filename: file.filename,
          mimeType: file.mimeType,
          sizeBytes: file.sizeBytes,
          source: "sample",
          kind: file.kind,
        },
        now,
      );
      return [
        file.filename,
        { documentId: document.id, filename: file.filename },
      ];
    }),
  );
  return (filename) => {
    const ref = refs.get(filename);
    if (!ref) throw new Error(`sample file ${filename} is not in the manifest`);
    return ref;
  };
};

/** Saves the fixture's records against the stored documents. */
const storeRecords = (
  db: Db,
  refFor: (filename: string) => DocumentRef,
  now: number,
): void => {
  const input = briefSampleRecords(refFor);
  input.contracts.forEach((record) =>
    orThrow(record.filename, saveContract(db, record, now)),
  );
  input.purchaseOrders.forEach((record) =>
    orThrow(record.filename, savePurchaseOrder(db, record, now)),
  );
  input.invoices.forEach((record) =>
    orThrow(record.filename, saveInvoice(db, record, now)),
  );
  const receiptsDoc = refFor(BRIEF_SAMPLE.receipts.filename);
  orThrow(
    receiptsDoc.filename,
    saveReceipts(db, receiptsDoc.documentId, input.receipts, now),
  );
  const paymentsDoc = refFor(BRIEF_SAMPLE.payments.filename);
  orThrow(
    paymentsDoc.filename,
    savePayments(db, paymentsDoc.documentId, input.payments, now),
  );
};

/**
 * The offline audit (Feature 6): clears everything, loads the brief sample from its structured
 * copy (no model call, no API key), runs the checks and stores the findings. All in one
 * transaction, so running it again replaces the run, and a failure leaves the old data intact.
 */
export const runSampleAudit = (
  db: Db,
  clock: () => number = Date.now,
  manifest: ManifestFiles = SAMPLE_MANIFEST,
): AuditRunResult =>
  db.transaction(() => {
    const now = clock();
    resetAll(db);
    storeRecords(db, storeDocuments(db, manifest, now), now);
    return runAudit(db, clock);
  });
