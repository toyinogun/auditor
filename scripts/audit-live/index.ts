import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { formatMismatch } from "@/lib/audit/compare";
import { runLiveAudit, type LiveReport } from "@/lib/audit/live";
import { SAMPLE_MANIFEST } from "@/lib/audit/sample";
import { getDb } from "@/lib/db/client";
import { env } from "@/lib/env";
import { createModelClient } from "@/lib/extract/client";
import { formatCents } from "@/lib/schemas/money";

/**
 * `pnpm audit:live [--dump]` (spec 0005): the real model reads the 12 sample PDFs, and the run
 * passes only when records, findings and the headline match offline mode to the cent. It costs
 * 12 to 24 API calls. `--dump` writes each extraction to `$DATA_DIR/live-dump/`.
 */

const SAMPLE_DIR = path.join(process.cwd(), "public", "sample");
const DUMP_DIR = path.join(env.DATA_DIR, "live-dump");

const say = (line: string): void => {
  process.stdout.write(`${line}\n`);
};

const readSampleFile = async (filename: string): Promise<Uint8Array> =>
  new Uint8Array(await readFile(path.join(SAMPLE_DIR, filename)));

const dump = async (report: LiveReport): Promise<void> => {
  await mkdir(DUMP_DIR, { recursive: true });
  await Promise.all(
    [...report.extracted].map(([filename, doc]) =>
      writeFile(
        path.join(DUMP_DIR, `${filename}.json`),
        `${JSON.stringify(doc, null, 2)}\n`,
      ),
    ),
  );
  say(`Wrote ${report.extracted.size} extractions to ${DUMP_DIR}`);
};

const printOutcomes = (report: LiveReport): void =>
  report.outcomes.forEach(({ filename, result }) =>
    say(
      result.ok
        ? `  ok    ${filename}: ${result.value}`
        : `  FAIL  ${filename}: ${result.error}`,
    ),
  );

const main = async (): Promise<number> => {
  const extract = createModelClient();
  if (!extract.apiKeySet) {
    say(
      "ANTHROPIC_API_KEY is not set. Add it to your environment and run again.",
    );
    return 1;
  }
  const report = await runLiveAudit(getDb(), SAMPLE_MANIFEST, {
    extract,
    readFile: readSampleFile,
  });
  say("Documents:");
  printOutcomes(report);
  if (process.argv.includes("--dump")) await dump(report);

  if (report.stored === null) {
    const failed = report.outcomes.filter(({ result }) => !result.ok).length;
    say(
      `Nothing stored: ${failed} document(s) failed. The database was not changed.`,
    );
    return 1;
  }
  const { runId, summary } = report.stored;
  say(
    `Audit run ${runId}: ${summary.findingCount} findings, ` +
      `${formatCents(summary.recoverableCents)} recoverable ` +
      `(${summary.recoverableShare} of ${formatCents(summary.invoicedTotalCents)})`,
  );
  if (report.mismatches.length > 0) {
    say(`${report.mismatches.length} mismatch(es) against offline mode:`);
    report.mismatches.forEach((mismatch) =>
      say(`  ${formatMismatch(mismatch)}`),
    );
    return 1;
  }
  say("Live run matches offline mode.");
  return 0;
};

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    process.stderr.write(
      `audit:live failed, the database was not changed\n${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exit(1);
  },
);
