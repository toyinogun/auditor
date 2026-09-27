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
import { orThrow } from "@/lib/schemas/result";
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

/** Saves every record against its stored document. A save that fails here is a bug, so it throws. */
export const saveAuditInput = (
  db: Db,
  input: AuditInput,
  csvRefs: { readonly receipts: DocumentRef; readonly payments: DocumentRef },
  now: number,
): void => {
  input.contracts.forEach((record) =>
    orThrow(record.filename, saveContract(db, record, now)),
  );
  input.purchaseOrders.forEach((record) =>
    orThrow(record.filename, savePurchaseOrder(db, record, now)),
  );
  input.invoices.forEach((record) =>
    orThrow(record.filename, saveInvoice(db, record, now)),
  );
  const { receipts, payments } = csvRefs;
  orThrow(
    receipts.filename,
    saveReceipts(db, receipts.documentId, input.receipts, now),
  );
  orThrow(
    payments.filename,
    savePayments(db, payments.documentId, input.payments, now),
  );
};
