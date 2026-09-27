import { loadSample } from "@/lib/audit/sample";
import { getDb } from "@/lib/db/client";
import { uploadStore } from "@/lib/ingest/deps";
import { formatCents } from "@/lib/schemas/money";

/**
 * `pnpm audit:sample` (Feature 6): loads the brief sample into `$DATA_DIR/auditor.db`, runs the
 * checks and stores the findings, with no API key. Running it again replaces the run and empties
 * `$DATA_DIR/uploads/` (spec 0006, AC-14).
 */

const main = async (): Promise<number> => {
  const { runId, summary } = await loadSample(getDb(), uploadStore());
  process.stdout.write(
    `Audit run ${runId}: ${summary.findingCount} findings, ` +
      `${formatCents(summary.recoverableCents)} recoverable ` +
      `(${summary.recoverableShare} of ${formatCents(summary.invoicedTotalCents)} ` +
      `across ${summary.invoiceCount} invoices)\n`,
  );
  return 0;
};

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    process.stderr.write(
      `audit:sample failed, the database was not changed\n${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exit(1);
  },
);
