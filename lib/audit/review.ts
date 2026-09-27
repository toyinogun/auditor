import "server-only";
import type { FindingView } from "@/lib/db/audit";

/** The review screen's Approved and Pending tiles (spec 0008, AC-1). */
export type ReviewTotals = {
  readonly approvedCents: number;
  readonly pendingCount: number;
  readonly findingCount: number;
};

/**
 * Approved sums only `recover` findings, so it can never exceed Recoverable. A decision made on
 * an older amount already reads as pending from `listFindings`, so it adds nothing here.
 */
export const reviewTotals = (
  findings: readonly FindingView[],
): ReviewTotals => ({
  approvedCents: findings
    .filter(
      (finding) =>
        finding.decision.status === "approved" && finding.action === "recover",
    )
    .reduce((total, finding) => total + finding.amountCents, 0),
  pendingCount: findings.filter(
    (finding) => finding.decision.status === "pending",
  ).length,
  findingCount: findings.length,
});

/**
 * The first pending finding after `currentKey` in list order, wrapping to the top, or null when
 * none is pending. A key no longer in the list starts the search before the first row (AC-8).
 */
export const nextPendingKey = (
  findings: readonly FindingView[],
  currentKey: string,
): string | null => {
  const start =
    findings.findIndex((finding) => finding.findingKey === currentKey) + 1;
  const rotated = [...findings.slice(start), ...findings.slice(0, start)];
  return (
    rotated.find((finding) => finding.decision.status === "pending")
      ?.findingKey ?? null
  );
};
