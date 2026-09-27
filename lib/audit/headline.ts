import "server-only";
import { recoverableShareText } from "@/lib/checks";
import { latestAuditRun } from "@/lib/db/audit";
import type { Db } from "@/lib/db/client";
import { formatCents } from "@/lib/schemas/money";

/** The figures the upload panel and the webhook answer show (spec 0006, value sourcing). */
export type Headline = {
  readonly findingCount: number;
  readonly recoverableCents: number;
  readonly invoicedTotalCents: number;
  /** One decimal, such as "18.1%", rounded the way spec 0004 does. */
  readonly recoverableShare: string;
};

/** The newest audit run's headline, or null before the first run. */
export const latestHeadline = (db: Db): Headline | null => {
  const run = latestAuditRun(db);
  if (run === null) return null;
  return {
    findingCount: run.findingCount,
    recoverableCents: run.recoverableTotalCents,
    invoicedTotalCents: run.invoicedTotalCents,
    recoverableShare: recoverableShareText(
      run.recoverableTotalCents,
      run.invoicedTotalCents,
    ),
  };
};

/** "8 findings, $9,766.85 recoverable of $53,939.60 invoiced (18.1%)", or "No audit yet". */
export const headlineText = (headline: Headline | null): string => {
  if (headline === null) return "No audit yet";
  const { findingCount, recoverableCents, invoicedTotalCents } = headline;
  const findings = findingCount === 1 ? "finding" : "findings";
  return (
    `${findingCount} ${findings}, ${formatCents(recoverableCents)} recoverable ` +
    `of ${formatCents(invoicedTotalCents)} invoiced (${headline.recoverableShare})`
  );
};
