import type { Finding } from "@/lib/schemas/finding";
import { normalizeInvoiceNumber } from "@/lib/schemas/keys";
import { formatCents } from "@/lib/schemas/money";
import type { InvoiceRecord, PaymentRecord } from "@/lib/schemas/records";
import { buildFinding } from "./action";
import type { AuditContext } from "./context";
import { evidenceItem, INVOICE_LABEL, rowLocator } from "./evidence";

/** Duplicate invoices (spec 0004, AC-4 and AC-5). Runs first; its copies skip every other check. */

export type DuplicateResult = {
  readonly findings: readonly Finding[];
  readonly duplicateDocumentIds: ReadonlySet<number>;
};

type Group = readonly InvoiceRecord[];

const sameNumber = (a: InvoiceRecord, b: InvoiceRecord): boolean =>
  normalizeInvoiceNumber(a.invoiceNumber) ===
  normalizeInvoiceNumber(b.invoiceNumber);

const samePoAndTotal = (a: InvoiceRecord, b: InvoiceRecord): boolean =>
  a.poNumber !== null &&
  a.poNumber === b.poNumber &&
  a.totalCents === b.totalCents;

const isDuplicatePair = (a: InvoiceRecord, b: InvoiceRecord): boolean =>
  a.supplierKey === b.supplierKey && (sameNumber(a, b) || samePoAndTotal(a, b));

/** Invoice date, then lower document: the first is the original. */
export const byInvoiceOrder = (a: InvoiceRecord, b: InvoiceRecord): number =>
  a.invoiceDate.localeCompare(b.invoiceDate) || a.documentId - b.documentId;

/** Connected groups: an invoice joins, and merges, every group it matches a member of. */
const groupInvoices = (invoices: readonly InvoiceRecord[]): readonly Group[] =>
  [...invoices]
    .sort(byInvoiceOrder)
    .reduce<readonly Group[]>((groups, invoice) => {
      const matches = (group: Group) =>
        group.some((member) => isDuplicatePair(member, invoice));
      const merged = [...groups.filter(matches).flat(), invoice].sort(
        byInvoiceOrder,
      );
      return [...groups.filter((group) => !matches(group)), merged];
    }, []);

const paymentRowsText = (payments: readonly PaymentRecord[]): string =>
  [...Map.groupBy(payments, (p) => p.filename)]
    .map(
      ([filename, rows]) =>
        `${filename} rows ${rows.map((p) => p.rowNo).join(", ")}`,
    )
    .join("; ");

const copyFinding = (
  original: InvoiceRecord,
  copy: InvoiceRecord,
  position: number,
  payments: readonly PaymentRecord[],
): Finding => {
  const total = formatCents(copy.totalCents);
  const paidTwice = payments.length >= position + 1;
  const matchedOnNumber = sameNumber(original, copy);
  return buildFinding(copy, {
    check: "duplicate",
    action: paidTwice ? "recover" : "block_payment",
    amountCents: copy.totalCents,
    title: `Duplicate of ${original.invoiceNumber}, ${paidTwice ? "paid twice" : "unpaid"}`,
    calculation: paidTwice
      ? `Invoice total ${total}, paid twice (${paymentRowsText(payments)}) = ${total}`
      : `Invoice total ${total}, not yet paid = ${total} to block`,
    evidence: [
      evidenceItem(
        "Invoice number",
        copy.invoiceNumber,
        copy,
        INVOICE_LABEL.number,
      ),
      evidenceItem("Invoice total", total, copy, INVOICE_LABEL.total),
      evidenceItem(
        "Original invoice",
        original.invoiceNumber,
        original,
        INVOICE_LABEL.number,
      ),
      evidenceItem(
        "Matched on",
        matchedOnNumber ? "invoice number" : "PO and total",
        copy,
        matchedOnNumber ? INVOICE_LABEL.number : INVOICE_LABEL.po,
      ),
      ...payments.map((payment) =>
        evidenceItem(
          "Payment",
          `${formatCents(payment.amountCents)} for ${payment.invoiceNumber} on ${payment.paidDate}`,
          payment,
          rowLocator(payment.rowNo),
        ),
      ),
    ],
  });
};

const groupFindings = (group: Group, ctx: AuditContext): readonly Finding[] => {
  const [original, ...copies] = group;
  const payments = ctx.paymentsFor(
    original.supplierKey,
    group.map((member) => normalizeInvoiceNumber(member.invoiceNumber)),
  );
  return copies.map((copy, index) =>
    copyFinding(original, copy, index + 1, payments),
  );
};

export const findDuplicates = (
  invoices: readonly InvoiceRecord[],
  ctx: AuditContext,
): DuplicateResult => {
  const groups = groupInvoices(invoices).filter((group) => group.length > 1);
  return {
    findings: groups.flatMap((group) => groupFindings(group, ctx)),
    duplicateDocumentIds: new Set(
      groups.flatMap((group) => group.slice(1).map((copy) => copy.documentId)),
    ),
  };
};
