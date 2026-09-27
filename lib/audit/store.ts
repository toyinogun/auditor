import "server-only";
import type { Db } from "@/lib/db/client";
import { insertDocument } from "@/lib/db/documents";
import {
  saveContract,
  saveInvoice,
  savePayments,
  savePurchaseOrder,
  saveReceipts,
} from "@/lib/db/records";
import type { AuditInput, DocumentRef } from "@/lib/schemas/records";
import { err, ok, orThrow, type Result } from "@/lib/schemas/result";
import type { SampleManifest } from "@/lib/schemas/sample-manifest";

/**
 * Storage steps shared by the offline run (`sample.ts`) and the live run (`live.ts`), so both
 * number documents and save records the same way. Call them inside the caller's transaction.
 */

export type ManifestFiles = Pick<SampleManifest, "files">;

export type RefFor = (filename: string) => DocumentRef;

/** Stores one document per manifest file, in manifest order with its real hash; returns a ref lookup. */
export const storeManifestDocuments = (
  db: Db,
  manifest: ManifestFiles,
  now: number,
): RefFor => {
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

export type CsvRefs = {
  readonly receipts: DocumentRef;
  readonly payments: DocumentRef;
};

/** The first save the database refused, and the file whose record it was. */
export type SaveFailure = { readonly filename: string; readonly error: string };

/**
 * Saves every record against its stored document, stopping at the first save the database
 * refuses (an overlapping contract, say). Live records come from the model, so a refusal is an
 * expected failure there; the caller rolls back its transaction.
 */
export const trySaveAuditInput = (
  db: Db,
  input: AuditInput,
  csvRefs: CsvRefs,
  now: number,
): Result<void, SaveFailure> => {
  const { receipts, payments } = csvRefs;
  const saves: readonly (readonly [string, () => Result<unknown>])[] = [
    ...input.contracts.map(
      (record) =>
        [record.filename, () => saveContract(db, record, now)] as const,
    ),
    ...input.purchaseOrders.map(
      (record) =>
        [record.filename, () => savePurchaseOrder(db, record, now)] as const,
    ),
    ...input.invoices.map(
      (record) =>
        [record.filename, () => saveInvoice(db, record, now)] as const,
    ),
    [
      receipts.filename,
      () => saveReceipts(db, receipts.documentId, input.receipts, now),
    ],
    [
      payments.filename,
      () => savePayments(db, payments.documentId, input.payments, now),
    ],
  ];
  for (const [filename, save] of saves) {
    const saved = save();
    if (!saved.ok) return err({ filename, error: saved.error });
  }
  return ok(undefined);
};

/** Saves every record from a committed fixture. A refusal here is a bug, so it throws. */
export const saveAuditInput = (
  db: Db,
  input: AuditInput,
  csvRefs: CsvRefs,
  now: number,
): void => {
  const saved = trySaveAuditInput(db, input, csvRefs, now);
  if (!saved.ok) orThrow(saved.error.filename, err(saved.error.error));
};
