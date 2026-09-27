import "server-only";
import { recoverableShareText } from "@/lib/checks";
import { latestAuditRun, type AuditRunRow } from "@/lib/db/audit";
import type { Db } from "@/lib/db/client";

/** The figures the upload panel and the webhook answer show (spec 0006, value sourcing). */
export type Headline = {
  readonly findingCount: number;
  readonly recoverableCents: number;
  readonly invoicedTotalCents: number;
  /** One decimal, such as "18.1%", rounded the way spec 0004 does. */
  readonly recoverableShare: string;
};

/** One run's headline; pure, for callers that already hold the run row. */
export const headlineFor = (run: AuditRunRow): Headline => ({
  findingCount: run.findingCount,
  recoverableCents: run.recoverableTotalCents,
  invoicedTotalCents: run.invoicedTotalCents,
  recoverableShare: recoverableShareText(
    run.recoverableTotalCents,
    run.invoicedTotalCents,
  ),
});

/** The newest audit run's headline, or null before the first run. */
export const latestHeadline = (db: Db): Headline | null => {
  const run = latestAuditRun(db);
  return run === null ? null : headlineFor(run);
};
