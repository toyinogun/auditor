import "server-only";
import { SAMPLE_MANIFEST } from "@/lib/audit/sample";
import type { DocumentRecords } from "@/lib/audit/store";
import { briefSampleRecords } from "@/lib/schemas/fixtures/brief-sample-records";
import type { AuditInput } from "@/lib/schemas/records";
import type { SampleManifestEntry } from "@/lib/schemas/sample-manifest";

/**
 * The demo allowlist (spec 0006, AC-7): on the public demo only the 14 sample files pass, known
 * by their SHA-256 in `public/sample/manifest.json`, and their records come from the fixture, so
 * no document ever reaches the model there.
 */

export type SampleFile = {
  readonly entry: SampleManifestEntry;
  /** The file's fixture records, stored under this document id. */
  readonly recordsFor: (documentId: number) => DocumentRecords;
};

/** The fixture once, with placeholder refs (id 0, manifest filename); ids are set per upload. */
const PLACEHOLDER_RECORDS: AuditInput = briefSampleRecords((filename) => ({
  documentId: 0,
  filename,
}));

const findRecord = <T extends { readonly filename: string }>(
  records: readonly T[],
  entry: SampleManifestEntry,
): T => {
  const found = records.find((record) => record.filename === entry.filename);
  if (!found) throw new Error(`no fixture record for ${entry.filename}`);
  return found;
};

/** A PDF sample always has a text layer flag; null means a broken manifest, so it throws. */
const textLayerOf = (entry: SampleManifestEntry): boolean => {
  if (entry.hasTextLayer === null) {
    throw new Error(`${entry.filename} has no text layer flag`);
  }
  return entry.hasTextLayer;
};

const recordsOf = (
  entry: SampleManifestEntry,
): ((documentId: number) => DocumentRecords) => {
  const records = PLACEHOLDER_RECORDS;
  switch (entry.kind) {
    case "invoice": {
      const record = findRecord(records.invoices, entry);
      const hasTextLayer = textLayerOf(entry);
      return (documentId) => ({
        kind: "invoice",
        record: { ...record, documentId },
        hasTextLayer,
      });
    }
    case "contract": {
      const record = findRecord(records.contracts, entry);
      const hasTextLayer = textLayerOf(entry);
      return (documentId) => ({
        kind: "contract",
        record: { ...record, documentId },
        hasTextLayer,
      });
    }
    case "purchase_order": {
      const record = findRecord(records.purchaseOrders, entry);
      const hasTextLayer = textLayerOf(entry);
      return (documentId) => ({
        kind: "purchase_order",
        record: { ...record, documentId },
        hasTextLayer,
      });
    }
    case "receipts_csv":
      return (documentId) => ({
        kind: "receipts_csv",
        documentId,
        rows: records.receipts.map((row) => ({ ...row, documentId })),
      });
    case "payments_csv":
      return (documentId) => ({
        kind: "payments_csv",
        documentId,
        rows: records.payments.map((row) => ({ ...row, documentId })),
      });
  }
};

const SAMPLES: ReadonlyMap<string, SampleFile> = new Map(
  SAMPLE_MANIFEST.files.map((entry) => [
    entry.sha256,
    { entry, recordsFor: recordsOf(entry) },
  ]),
);

/** The sample file with these bytes' hash, or null for any other file. */
export const sampleFor = (sha256: string): SampleFile | null =>
  SAMPLES.get(sha256) ?? null;
