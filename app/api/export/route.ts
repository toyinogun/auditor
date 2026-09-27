import { handleExportRequest } from "@/lib/audit/export";
import { getDb } from "@/lib/db/client";

/** The finding log download (spec 0009, AC-3). Node runtime: SQLite and exceljs. */
export const runtime = "nodejs";

export const GET = (request: Request): Promise<Response> =>
  handleExportRequest(request, { db: getDb, clock: Date.now });
