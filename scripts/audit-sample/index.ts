import { runSampleAudit } from "@/lib/audit/sample";
import { getDb } from "@/lib/db/client";
import { formatCents } from "@/lib/schemas/money";

/**
 * `pnpm audit:sample` (Feature 6): loads the brief sample into `$DATA_DIR/auditor.db`, runs the
 * checks and stores the findings, with no API key. Running it again replaces the run.
 */

const main = (): number => {
  const { runId, summary } = runSampleAudit(getDb());
  process.stdout.write(
    `Audit run ${runId}: ${summary.findingCount} findings, ` +
      `${formatCents(summary.recoverableCents)} recoverable ` +
      `(${summary.recoverableShare} of ${formatCents(summary.invoicedTotalCents)} ` +
      `across ${summary.invoiceCount} invoices)\n`,
  );
  return 0;
};

try {
  process.exit(main());
} catch (error) {
  process.stderr.write(
    `audit:sample failed, the database was not changed\n${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(1);
}
