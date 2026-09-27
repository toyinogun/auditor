import "server-only";
import { latestAuditRun, listFindings } from "@/lib/db/audit";
import type { Db } from "@/lib/db/client";
import { toCsv } from "@/lib/export/csv";
import { exportFileName } from "@/lib/export/format";
import {
  ExportFormat,
  exportTable,
  type ExportSnapshot,
} from "@/lib/export/table";
import { toXlsx } from "@/lib/export/xlsx";
import { logEvent } from "@/lib/log";
import { latestHeadline } from "./headline";
import { reviewTotals } from "./review";

/**
 * `GET /api/export` (spec 0009, AC-3, AC-12, AC-14): reads the review snapshot, builds one table
 * and writes it as .xlsx or .csv. The totals come from the same functions as the review tiles,
 * so the file always reconciles to the screen. Config comes in as a value, like the webhook.
 */

export type ExportConfig = {
  readonly db: () => Db;
  readonly clock: () => number;
};

const CONTENT_TYPE: Readonly<Record<ExportFormat, string>> = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv; charset=utf-8",
};

const BAD_FORMAT = "format must be xlsx or csv";
const NO_RUN = "No audit run yet";

/**
 * The run, its headline, its findings and the tiles in one transaction, so another visitor's
 * Load sample data cannot land between the rows and the totals. Null before the first run.
 */
export const readExport = (db: Db): ExportSnapshot | null =>
  db.transaction(() => {
    const run = latestAuditRun(db);
    const headline = latestHeadline(db);
    if (run === null || headline === null) return null;
    const findings = listFindings(db);
    return { run, headline, findings, totals: reviewTotals(findings) };
  });

const plainText = (status: number, body: string): Response =>
  new Response(body, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });

const fileBody = async (
  format: ExportFormat,
  snapshot: ExportSnapshot,
  now: number,
): Promise<BodyInit> => {
  const table = exportTable(snapshot, now);
  return format === "csv" ? toCsv(table) : toXlsx(table);
};

export const handleExportRequest = async (
  request: Request,
  config: ExportConfig,
): Promise<Response> => {
  const startedAt = config.clock();
  const elapsed = (): number => config.clock() - startedAt;
  const format = ExportFormat.safeParse(
    new URL(request.url).searchParams.get("format"),
  );
  if (!format.success) {
    logEvent({
      event: "export",
      format: null,
      outcome: "bad_format",
      ms: elapsed(),
    });
    return plainText(400, BAD_FORMAT);
  }
  const snapshot = readExport(config.db());
  if (snapshot === null) {
    logEvent({
      event: "export",
      format: format.data,
      outcome: "no_run",
      ms: elapsed(),
    });
    return plainText(404, NO_RUN);
  }
  const body = await fileBody(format.data, snapshot, startedAt);
  logEvent({
    event: "export",
    format: format.data,
    outcome: "ok",
    findingCount: snapshot.findings.length,
    ms: elapsed(),
  });
  return new Response(body, {
    headers: {
      "Content-Type": CONTENT_TYPE[format.data],
      "Content-Disposition": `attachment; filename="${exportFileName(format.data, startedAt)}"`,
      "Cache-Control": "no-store",
    },
  });
};
