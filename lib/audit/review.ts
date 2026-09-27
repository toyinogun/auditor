import "server-only";
import {
  describeInvoiceLines,
  type InvoiceView,
} from "@/lib/checks/invoice-view";
import {
  decide,
  latestAuditRun,
  listFindings,
  type FindingView,
} from "@/lib/db/audit";
import type { Db } from "@/lib/db/client";
import { loadAuditInput } from "@/lib/db/records";
import { logEvent } from "@/lib/log";
import { DecisionStatus } from "@/lib/schemas/enums";
import type { DecideError } from "@/lib/schemas/finding";
import { ok, type Result } from "@/lib/schemas/result";
import { latestHeadline, type Headline } from "./headline";

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

/** The finding the detail panel shows and its invoice (spec 0008, AC-3, AC-4). */
export type ReviewSelection = {
  readonly finding: FindingView;
  readonly view: InvoiceView;
  /** False when no key was asked for, or the asked for key is not in the run. */
  readonly requested: boolean;
};

/** Everything `/review` shows, read as one snapshot. */
export type ReviewSnapshot = {
  readonly headline: Headline | null;
  readonly findings: readonly FindingView[];
  readonly invoiceCount: number;
  readonly selection: ReviewSelection | null;
};

const selectionFor = (
  db: Db,
  findings: readonly FindingView[],
  requestedKey: string | null,
): ReviewSelection | null => {
  const requested = findings.find((f) => f.findingKey === requestedKey);
  const finding = requested ?? findings[0];
  if (finding === undefined) return null;
  const view = describeInvoiceLines(
    loadAuditInput(db),
    finding.invoiceDocumentId,
  );
  if (view === null) {
    throw new Error(
      `finding ${finding.findingKey} names document ${finding.invoiceDocumentId}, which has no invoice`,
    );
  }
  return { finding, view, requested: requested !== undefined };
};

/**
 * The review screen's data in one transaction, so a Load sample data from another visitor
 * cannot land between reading the findings and reading their invoices. The selection falls
 * back to the first (largest) finding when `requestedKey` is null or not in the run (AC-3).
 */
export const readReview = (
  db: Db,
  requestedKey: string | null,
): ReviewSnapshot =>
  db.transaction(() => {
    const headline = latestHeadline(db);
    const findings = headline === null ? [] : listFindings(db);
    return {
      headline,
      findings,
      invoiceCount: latestAuditRun(db)?.invoiceCount ?? 0,
      selection: selectionFor(db, findings, requestedKey),
    };
  });

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
