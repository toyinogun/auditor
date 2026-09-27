import "server-only";
import { runChecks, summarizeFindings, type AuditSummary } from "@/lib/checks";
import { saveAuditRun } from "@/lib/db/audit";
import type { Db } from "@/lib/db/client";
import { loadAuditInput } from "@/lib/db/records";

export type AuditRunResult = {
  readonly runId: number;
  readonly summary: AuditSummary;
};

/**
 * Runs the six checks over every stored record and saves the run, replacing earlier findings
 * (spec 0004). `clock` is read once before and once after, for the run's start and finish.
 */
export const runAudit = (
  db: Db,
  clock: () => number = Date.now,
): AuditRunResult => {
  const startedAt = clock();
  const input = loadAuditInput(db);
  const findings = runChecks(input);
  const runId = saveAuditRun(db, { startedAt, finishedAt: clock() }, findings);
  return { runId, summary: summarizeFindings(input.invoices, findings) };
};
