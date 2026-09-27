import type { DocumentKind } from "@/lib/schemas/enums";
import { BRIEF_SAMPLE } from "@/lib/schemas/fixtures/brief-sample";
import {
  BRIEF_SAMPLE_FILENAMES,
  briefSampleRecords,
} from "@/lib/schemas/fixtures/brief-sample-records";
import type { AuditInput, DocumentRef } from "@/lib/schemas/records";
import type { Result } from "@/lib/schemas/result";
import type { Db } from "./client";
import { insertDocument } from "./documents";
import {
  saveContract,
  saveInvoice,
  savePayments,
  savePurchaseOrder,
  saveReceipts,
} from "./records";

/** Test support: loads the brief sample into a database. Not imported by app code. */

export const TEST_NOW = 1_790_000_000_000;

export const unwrap = <T>(result: Result<T>): T => {
  if (!result.ok) throw new Error(result.error);
  return result.value;
};

export const addDocument = (
  db: Db,
  filename: string,
  kind: DocumentKind | null = null,
): DocumentRef => {
  const { document } = insertDocument(
    db,
    {
      sha256: `sha256-of-${filename}`,
      filename,
      mimeType: filename.endsWith(".csv") ? "text/csv" : "application/pdf",
      sizeBytes: 2048,
      source: "sample",
      kind,
    },
    TEST_NOW,
  );
  return { documentId: document.id, filename: document.filename };
};

/** Stores every sample document and returns the records as converted, before any storage. */
export const seedBriefSample = (db: Db): AuditInput => {
  const refs = new Map(
    BRIEF_SAMPLE_FILENAMES.map((filename) => [
      filename,
      addDocument(db, filename),
    ]),
  );
  const refFor = (filename: string): DocumentRef => {
    const ref = refs.get(filename);
    if (!ref) throw new Error(`sample file ${filename} was not stored`);
    return ref;
  };
  const input = briefSampleRecords(refFor);
  const receiptsDocumentId = refFor(BRIEF_SAMPLE.receipts.filename).documentId;
  const paymentsDocumentId = refFor(BRIEF_SAMPLE.payments.filename).documentId;

  input.contracts.forEach((record) =>
    unwrap(saveContract(db, record, TEST_NOW)),
  );
  input.purchaseOrders.forEach((record) =>
    unwrap(savePurchaseOrder(db, record, TEST_NOW)),
  );
  input.invoices.forEach((record) => unwrap(saveInvoice(db, record, TEST_NOW)));
  unwrap(saveReceipts(db, receiptsDocumentId, input.receipts, TEST_NOW));
  unwrap(savePayments(db, paymentsDocumentId, input.payments, TEST_NOW));
  return input;
};
