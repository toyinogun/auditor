import "server-only";
import { decide, listFindings, type FindingView } from "@/lib/db/audit";
import type { Db } from "@/lib/db/client";
import { logEvent } from "@/lib/log";
import { DecisionStatus } from "@/lib/schemas/enums";
import type { DecideError } from "@/lib/schemas/finding";
import { ok, type Result } from "@/lib/schemas/result";

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

/** What the decision bar needs back after Approve or Reject (spec 0008, AC-8). */
export type DecisionMade = {
  readonly status: DecisionStatus;
  readonly nextFindingKey: string | null;
};

const fieldOf = (input: unknown, field: string): unknown =>
  typeof input === "object" && input !== null && field in input
    ? (input as Record<string, unknown>)[field]
    : undefined;

/**
 * Stores one decision through `decide`, logs `finding_decided` (never the reason, AC-15) and
 * returns the next pending key, read after the write so it never comes from stale props.
 */
export const recordDecision = (
  db: Db,
  input: unknown,
  now: number = Date.now(),
): Result<DecisionMade, DecideError> => {
  const result = decide(db, input, now);
  const findings = listFindings(db);
  const finding = findings.find(
    (candidate) => candidate.findingKey === fieldOf(input, "findingKey"),
  );
  const status = DecisionStatus.safeParse(fieldOf(input, "status"));
  logEvent({
    event: "finding_decided",
    status: status.success ? status.data : null,
    ...(finding ? { checkId: finding.checkId } : {}),
    outcome: result.ok ? "ok" : result.error.code,
  });
  if (!result.ok) return result;
  return ok({
    status: result.value.status,
    nextFindingKey: nextPendingKey(findings, result.value.findingKey),
  });
};
