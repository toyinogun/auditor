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
