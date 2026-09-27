import {
  toContractRecord,
  toInvoiceRecord,
  toPaymentRecord,
  toPurchaseOrderRecord,
  toReceiptRecord,
} from "../convert";
import type { AuditInput, DocumentRef } from "../records";
import type { Result } from "../result";
import { BRIEF_SAMPLE } from "./brief-sample";

/**
 * The brief sample as records, so the checks can be tested with no database (spec 0004).
 * A fixture that fails conversion is a bug in the fixture, so it throws.
 */

const orThrow = <T>(filename: string, result: Result<T>): T => {
  if (!result.ok) throw new Error(`${filename}: ${result.error}`);
  return result.value;
};

/** Every sample file in the order `seedBriefSample` stores them. */
const FIXTURE_ORDER: readonly string[] = [
  ...BRIEF_SAMPLE.contracts.map((doc) => doc.filename),
  ...BRIEF_SAMPLE.purchaseOrders.map((doc) => doc.filename),
  ...BRIEF_SAMPLE.invoices.map((doc) => doc.filename),
  BRIEF_SAMPLE.receipts.filename,
  BRIEF_SAMPLE.payments.filename,
];

const fixtureOrderRef = (filename: string): DocumentRef => ({
  documentId: FIXTURE_ORDER.indexOf(filename) + 1,
  filename,
});

/** The sample's records. By default documents are numbered 1 to 14 in fixture order. */
export const briefSampleRecords = (
  refFor: (filename: string) => DocumentRef = fixtureOrderRef,
): AuditInput => {
  const receiptsRef = refFor(BRIEF_SAMPLE.receipts.filename);
  const paymentsRef = refFor(BRIEF_SAMPLE.payments.filename);
  return {
    contracts: BRIEF_SAMPLE.contracts.map((doc) =>
      orThrow(
        doc.filename,
        toContractRecord(doc.extraction, refFor(doc.filename)),
      ),
    ),
    purchaseOrders: BRIEF_SAMPLE.purchaseOrders.map((doc) =>
      orThrow(
        doc.filename,
        toPurchaseOrderRecord(doc.extraction, refFor(doc.filename)),
      ),
    ),
    invoices: BRIEF_SAMPLE.invoices.map((doc) =>
      orThrow(
        doc.filename,
        toInvoiceRecord(doc.extraction, refFor(doc.filename)),
      ),
    ),
    receipts: BRIEF_SAMPLE.receipts.rows.map((row, index) =>
      orThrow(
        receiptsRef.filename,
        toReceiptRecord(row, receiptsRef, index + 1),
      ),
    ),
    payments: BRIEF_SAMPLE.payments.rows.map((row, index) =>
      orThrow(
        paymentsRef.filename,
        toPaymentRecord(row, paymentsRef, index + 1),
      ),
    ),
  };
};
