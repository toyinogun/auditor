import type { Finding } from "@/lib/schemas/finding";
import type { InvoiceRecord } from "@/lib/schemas/records";

/** The headline figures, derived at read time (spec 0004, AC-2 and AC-6). */
export type AuditSummary = {
  readonly invoiceCount: number;
  readonly invoicedTotalCents: number;
  readonly recoverableCents: number;
  readonly blockedCents: number;
  readonly findingCount: number;
  /** One decimal, such as "18.1%". */
  readonly recoverableShare: string;
};

const sumAmounts = (
  findings: readonly Finding[],
  action: Finding["action"],
): number =>
  findings
    .filter((finding) => finding.action === action)
    .reduce((total, finding) => total + finding.amountCents, 0);

/** `part / whole` in tenths of a percent, rounded half away from zero, in whole numbers only. */
const shareText = (part: number, whole: number): string => {
  if (whole === 0) return "0.0%";
  const tenths = Math.floor((part * 2000 + whole) / (2 * whole));
  return `${Math.floor(tenths / 10)}.${tenths % 10}%`;
};

export const summarizeFindings = (
  invoices: readonly InvoiceRecord[],
  findings: readonly Finding[],
): AuditSummary => {
  const invoicedTotalCents = invoices.reduce(
    (total, invoice) => total + invoice.totalCents,
    0,
  );
  const recoverableCents = sumAmounts(findings, "recover");
  return {
    invoiceCount: invoices.length,
    invoicedTotalCents,
    recoverableCents,
    blockedCents: sumAmounts(findings, "block_payment"),
    findingCount: findings.length,
    recoverableShare: shareText(recoverableCents, invoicedTotalCents),
  };
};
