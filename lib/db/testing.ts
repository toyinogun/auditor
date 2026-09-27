import {
  toContractRecord,
  toInvoiceRecord,
  toPaymentRecord,
  toPurchaseOrderRecord,
  toReceiptRecord,
} from "@/lib/schemas/convert";
import type { DocumentKind } from "@/lib/schemas/enums";
import { BRIEF_SAMPLE } from "@/lib/schemas/fixtures/brief-sample";
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
  const contracts = BRIEF_SAMPLE.contracts.map((doc) =>
    unwrap(toContractRecord(doc.extraction, addDocument(db, doc.filename))),
  );
  const purchaseOrders = BRIEF_SAMPLE.purchaseOrders.map((doc) =>
    unwrap(
      toPurchaseOrderRecord(doc.extraction, addDocument(db, doc.filename)),
    ),
  );
  const invoices = BRIEF_SAMPLE.invoices.map((doc) =>
    unwrap(toInvoiceRecord(doc.extraction, addDocument(db, doc.filename))),
  );
  const receiptsDoc = addDocument(db, BRIEF_SAMPLE.receipts.filename);
  const receipts = BRIEF_SAMPLE.receipts.rows.map((row, i) =>
    unwrap(toReceiptRecord(row, receiptsDoc, i + 1)),
  );
  const paymentsDoc = addDocument(db, BRIEF_SAMPLE.payments.filename);
  const payments = BRIEF_SAMPLE.payments.rows.map((row, i) =>
    unwrap(toPaymentRecord(row, paymentsDoc, i + 1)),
  );

  contracts.forEach((record) => unwrap(saveContract(db, record, TEST_NOW)));
  purchaseOrders.forEach((record) =>
    unwrap(savePurchaseOrder(db, record, TEST_NOW)),
  );
  invoices.forEach((record) => unwrap(saveInvoice(db, record, TEST_NOW)));
  unwrap(saveReceipts(db, receiptsDoc.documentId, receipts, TEST_NOW));
  unwrap(savePayments(db, paymentsDoc.documentId, payments, TEST_NOW));
  return { contracts, purchaseOrders, invoices, receipts, payments };
};
