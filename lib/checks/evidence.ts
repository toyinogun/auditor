import type { EvidenceItem } from "@/lib/schemas/finding";
import { formatCents } from "@/lib/schemas/money";
import type { DocumentRef } from "@/lib/schemas/records";

/** Evidence builders and the text pieces every calculation shares (spec 0004, AC-7 and AC-8). */

export const MINUS = "−";
export const TIMES = "×";
export const REVIEW_ONLY_CALCULATION = "Review only, no amount claimed";

/** Fixed invoice level locators (AC-8). */
export const INVOICE_LABEL = {
  number: "Invoice number",
  date: "Invoice date",
  po: "PO number",
  subtotal: "Subtotal",
  total: "Invoice total",
} as const;

/**
 * Evidence labels the checks emit. The review screen reads them to decide what to highlight
 * (spec 0008, AC-5), so a check never writes a label as a bare string. Labels that name a PO
 * ("Billed earlier on PO-1", "Already over on PO-1") are built from a template instead.
 */
export const EVIDENCE_LABEL = {
  billedUnitPrice: "Billed unit price",
  quantityBilled: "Quantity billed",
  contractPrice: "Contract price",
  freightBilled: "Freight billed",
  freightTerms: "Freight terms",
  poNumber: "PO number",
  invoiceDate: "Invoice date",
  billedSku: "Billed SKU",
  invoiceNumber: "Invoice number",
  invoiceTotal: "Invoice total",
  originalInvoice: "Original invoice",
  matchedOn: "Matched on",
  payment: "Payment",
  priceUsed: "Price used",
  quantityReceived: "Quantity received",
  surchargeBilled: "Surcharge billed",
  permittedSurcharges: "Permitted surcharges",
  subtotal: "Subtotal",
  cap: "Cap",
  chargeBilled: "Charge billed",
} as const;

/** 1500 becomes "1,500". */
export const formatQuantity = (quantity: number): string =>
  quantity.toLocaleString("en-US");

/** One amount as "$306.00", several as "($150.00 + $156.00)". */
export const amountsTerm = (amounts: readonly number[]): string =>
  amounts.length === 1
    ? formatCents(amounts[0])
    : `(${amounts.map(formatCents).join(" + ")})`;

const sum = (values: readonly number[]): number =>
  values.reduce((total, value) => total + value, 0);

export const sumCents: (amounts: readonly number[]) => number = sum;
export const sumQuantities: (quantities: readonly number[]) => number = sum;

export const lineLocator = (lineNo: number): string => `line ${lineNo}`;
export const chargeLocator = (lineNo: number): string =>
  `charge line ${lineNo}`;
export const rowLocator = (rowNo: number): string => `row ${rowNo}`;

/** One figure and where it was read. `from` may be any record; only its document is kept. */
export const evidenceItem = (
  label: string,
  value: string,
  from: DocumentRef,
  locator: string,
): EvidenceItem => ({
  label,
  value,
  source: { documentId: from.documentId, filename: from.filename, locator },
});
