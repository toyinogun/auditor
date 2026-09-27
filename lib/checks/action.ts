import type { CheckId, FindingAction } from "@/lib/schemas/enums";
import type { EvidenceItem, Finding } from "@/lib/schemas/finding";
import { findingKey, normalizeInvoiceNumber } from "@/lib/schemas/keys";
import type { InvoiceRecord } from "@/lib/schemas/records";
import type { AuditContext } from "./context";
import { REVIEW_ONLY_CALCULATION } from "./evidence";

/** Paid means a ledger row of the same supplier matches this invoice's own number (AC-6). */
export const isPaid = (invoice: InvoiceRecord, ctx: AuditContext): boolean =>
  ctx.paymentsFor(invoice.supplierKey, [
    normalizeInvoiceNumber(invoice.invoiceNumber),
  ]).length > 0;

/** `recover` if paid, `block_payment` if not, `review_only` for $0 (AC-6). */
export const actionFor = (
  invoice: InvoiceRecord,
  ctx: AuditContext,
  amountCents: number,
): FindingAction => {
  if (amountCents === 0) return "review_only";
  return isPaid(invoice, ctx) ? "recover" : "block_payment";
};

export type FindingParts = {
  readonly check: CheckId;
  /** Omitted for a finding about the whole invoice. */
  readonly detail?: string;
  readonly action: FindingAction;
  readonly amountCents: number;
  readonly title: string;
  readonly calculation: string;
  readonly evidence: readonly EvidenceItem[];
};

/** Assembles a finding on `invoice`, keyed by `findingKey`. */
export const buildFinding = (
  invoice: InvoiceRecord,
  { check, detail, ...parts }: FindingParts,
): Finding => ({
  findingKey: findingKey({
    check,
    supplierKey: invoice.supplierKey,
    invoiceNumber: invoice.invoiceNumber,
    detail,
  }),
  checkId: check,
  invoiceDocumentId: invoice.documentId,
  ...parts,
});

/** A money finding whose action follows the invoice's payment status. */
export const moneyFinding = (
  invoice: InvoiceRecord,
  ctx: AuditContext,
  parts: Omit<FindingParts, "action">,
): Finding =>
  buildFinding(invoice, {
    ...parts,
    action: actionFor(invoice, ctx, parts.amountCents),
  });

/** A $0 finding for the analyst to look at (AC-9, AC-10, AC-11). */
export const reviewFinding = (
  invoice: InvoiceRecord,
  parts: Pick<FindingParts, "check" | "detail" | "title" | "evidence">,
): Finding =>
  buildFinding(invoice, {
    ...parts,
    action: "review_only",
    amountCents: 0,
    calculation: REVIEW_ONLY_CALCULATION,
  });
