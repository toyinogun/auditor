import {
  toContractRecord,
  toInvoiceRecord,
  toPaymentRecord,
  toPurchaseOrderRecord,
  toReceiptRecord,
} from "../../lib/schemas/convert";
import type {
  ContractExtraction,
  InvoiceExtraction,
  PaymentCsvRow,
  PurchaseOrderExtraction,
  ReceiptCsvRow,
} from "../../lib/schemas/extraction";
import type {
  SampleCsv,
  SampleDocument,
} from "../../lib/schemas/fixtures/brief-sample";
import type { DocumentRef } from "../../lib/schemas/records";
import { err, ok, type Result } from "../../lib/schemas/result";

/** The fixture's shape, so a test can pass a tampered copy. */
export type BriefSample = {
  readonly contracts: readonly SampleDocument<ContractExtraction>[];
  readonly purchaseOrders: readonly SampleDocument<PurchaseOrderExtraction>[];
  readonly invoices: readonly SampleDocument<InvoiceExtraction>[];
  readonly receipts: SampleCsv<ReceiptCsvRow>;
  readonly payments: SampleCsv<PaymentCsvRow>;
};

/** No database row exists yet when the generator validates, so every ref uses id 0 (spec 0003). */
const VALIDATION_DOCUMENT_ID = 0;

const refFor = (filename: string): DocumentRef => ({
  documentId: VALIDATION_DOCUMENT_ID,
  filename,
});

type Converter = (input: unknown, ref: DocumentRef) => Result<unknown>;
type RowConverter = (
  input: unknown,
  ref: DocumentRef,
  rowNo: number,
) => Result<unknown>;

const checkDocuments = <T>(
  documents: readonly SampleDocument<T>[],
  convert: Converter,
): readonly string[] =>
  documents.flatMap((doc) => {
    const result = convert(doc.extraction, refFor(doc.filename));
    return result.ok ? [] : [`${doc.filename}: ${result.error}`];
  });

const checkRows = <T>(
  csv: SampleCsv<T>,
  convert: RowConverter,
): readonly string[] =>
  csv.rows.flatMap((row, index) => {
    const result = convert(row, refFor(csv.filename), index + 1);
    return result.ok ? [] : [`${csv.filename}: ${result.error}`];
  });

/**
 * The arithmetic guard (AC-2): every document and CSV row must parse and convert exactly as
 * offline mode will, before anything is rendered. Every failure names the file and line or row.
 */
export const validateSample = (sample: BriefSample): Result<void> => {
  const errors = [
    ...checkDocuments(sample.contracts, toContractRecord),
    ...checkDocuments(sample.purchaseOrders, toPurchaseOrderRecord),
    ...checkDocuments(sample.invoices, toInvoiceRecord),
    ...checkRows(sample.receipts, toReceiptRecord),
    ...checkRows(sample.payments, toPaymentRecord),
  ];
  return errors.length > 0 ? err(errors.join("\n")) : ok(undefined);
};
