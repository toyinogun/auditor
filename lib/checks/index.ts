import { Finding } from "@/lib/schemas/finding";
import type { AuditInput } from "@/lib/schemas/records";
import { buildContext } from "./context";
import { checkContractPrice } from "./contract-price";
import { findDuplicates } from "./duplicate";
import { checkFreight } from "./freight";
import { checkMissingReferences } from "./missing-reference";
import { checkQuantityReceived } from "./quantity-received";
import { checkSurcharges } from "./surcharge";

export { summarizeFindings, type AuditSummary } from "./summary";

/** Largest amount first, then finding key, so the list never depends on input order (AC-14). */
const byAmountThenKey = (a: Finding, b: Finding): number =>
  b.amountCents - a.amountCents ||
  (a.findingKey < b.findingKey ? -1 : a.findingKey > b.findingKey ? 1 : 0);

const ORIGINAL_CHECKS = [
  checkContractPrice,
  checkQuantityReceived,
  checkSurcharges,
  checkFreight,
  checkMissingReferences,
] as const;

/**
 * Every finding for one audit (spec 0004). Duplicates first; the flagged copies are left out
 * of the five other checks so no dollar is claimed twice. A finding that fails `Finding` is a
 * bug in a check, so it throws.
 */
export const runChecks = (input: AuditInput): readonly Finding[] => {
  const ctx = buildContext(input);
  const duplicates = findDuplicates(input.invoices, ctx);
  const originals = input.invoices.filter(
    (invoice) => !duplicates.duplicateDocumentIds.has(invoice.documentId),
  );
  return [
    ...duplicates.findings,
    ...ORIGINAL_CHECKS.flatMap((check) => check(originals, ctx)),
  ]
    .map((finding) => Finding.parse(finding))
    .sort(byAmountThenKey);
};
