import "server-only";
import { asc, count, desc, eq, sum } from "drizzle-orm";
import { z } from "zod";
import {
  DecisionInput,
  EvidenceItem,
  Finding,
  type Decision,
  type DecisionState,
} from "@/lib/schemas/finding";
import { err, ok, type Result } from "@/lib/schemas/result";
import type { Db } from "./client";
import { auditRuns, decisions, findings, invoices } from "./schema";

export type AuditRunTimes = {
  readonly startedAt: number;
  readonly finishedAt: number;
};

/**
 * Stores one audit run and replaces every previous finding, in one transaction (AC-12).
 * Decisions are keyed by finding key and survive. A finding that names an invoice not in the
 * database is a bug in the checks, so it throws.
 */
export const saveAuditRun = (
  db: Db,
  run: AuditRunTimes,
  newFindings: readonly Finding[],
): number => {
  const parsed = newFindings.map((finding) => Finding.parse(finding));
  return db.transaction((tx) => {
    const invoiceIds = new Map(
      tx
        .select({ id: invoices.id, documentId: invoices.documentId })
        .from(invoices)
        .all()
        .map((row) => [row.documentId, row.id]),
    );
    const totals = tx
      .select({
        invoiceCount: count(),
        invoicedTotalCents: sum(invoices.totalCents),
      })
      .from(invoices)
      .get();
    const { id: runId } = tx
      .insert(auditRuns)
      .values({
        ...run,
        invoiceCount: totals?.invoiceCount ?? 0,
        invoicedTotalCents: Number(totals?.invoicedTotalCents ?? 0),
        recoverableTotalCents: parsed.reduce(
          (total, finding) => total + finding.amountCents,
          0,
        ),
        findingCount: parsed.length,
      })
      .returning({ id: auditRuns.id })
      .get();

    tx.delete(findings).run();
    const rows = parsed.map(({ invoiceDocumentId, evidence, ...finding }) => {
      const invoiceId = invoiceIds.get(invoiceDocumentId);
      if (invoiceId === undefined) {
        throw new Error(
          `finding ${finding.findingKey} names document ${invoiceDocumentId}, which has no invoice`,
        );
      }
      return {
        ...finding,
        runId,
        invoiceId,
        evidence: JSON.stringify(evidence),
      };
    });
    if (rows.length > 0) tx.insert(findings).values(rows).run();
    return runId;
  });
};

export type FindingView = Finding & {
  readonly id: number;
  readonly runId: number;
  readonly decision: DecisionState;
};

const Evidence = z.array(EvidenceItem).min(1);

/** A decision counts only while the finding still has the amount it was made on. */
const decisionState = (
  amountCents: number,
  row: {
    status: Decision["status"];
    reason: string | null;
    amountCents: number;
    decidedAt: number;
  } | null,
): DecisionState =>
  row === null || row.amountCents !== amountCents
    ? { status: "pending" }
    : { status: row.status, reason: row.reason, decidedAt: row.decidedAt };

/** The latest run's findings with their decision state, largest amount first. */
export const listFindings = (db: Db): readonly FindingView[] =>
  db
    .select({
      finding: findings,
      invoiceDocumentId: invoices.documentId,
      decision: decisions,
    })
    .from(findings)
    .innerJoin(invoices, eq(findings.invoiceId, invoices.id))
    .leftJoin(decisions, eq(findings.findingKey, decisions.findingKey))
    .orderBy(desc(findings.amountCents), asc(findings.id))
    .all()
    .map(({ finding, invoiceDocumentId, decision }) => ({
      id: finding.id,
      runId: finding.runId,
      findingKey: finding.findingKey,
      checkId: finding.checkId,
      action: finding.action,
      invoiceDocumentId,
      amountCents: finding.amountCents,
      title: finding.title,
      calculation: finding.calculation,
      evidence: Evidence.parse(JSON.parse(finding.evidence)),
      decision: decisionState(finding.amountCents, decision),
    }));

const describeIssues = (error: z.ZodError): string =>
  error.issues
    .map((issue) => `${issue.path.join(".") || "decision"}: ${issue.message}`)
    .join("; ");

/**
 * Stores an analyst's Approve or Reject by finding key, snapshotting the finding's amount.
 * Deciding again replaces the earlier decision. A reject needs a non blank reason.
 */
export const decide = (
  db: Db,
  input: unknown,
  now: number = Date.now(),
): Result<Decision> => {
  const parsed = DecisionInput.safeParse(input);
  if (!parsed.success) return err(describeIssues(parsed.error));
  const { findingKey, status } = parsed.data;
  const finding = db
    .select({ amountCents: findings.amountCents })
    .from(findings)
    .where(eq(findings.findingKey, findingKey))
    .get();
  if (!finding) return err(`finding ${findingKey} does not exist`);

  const reason = parsed.data.reason?.trim() || null;
  const decision = {
    findingKey,
    status,
    reason,
    amountCents: finding.amountCents,
    decidedAt: now,
  };
  db.insert(decisions)
    .values(decision)
    .onConflictDoUpdate({ target: decisions.findingKey, set: decision })
    .run();
  return ok(decision);
};
