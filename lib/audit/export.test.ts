import ExcelJS from "exceljs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decide, listFindings, saveAuditRun } from "@/lib/db/audit";
import { openDb, type Db } from "@/lib/db/client";
import { TEST_NOW } from "@/lib/db/testing";
import { handleExportRequest, readExport, type ExportConfig } from "./export";
import { runSampleAudit } from "./sample";

/** The export route's snapshot, answers and log (spec 0009, AC-3, AC-12 to AC-14). */

const NOW = Date.UTC(2026, 8, 27, 14, 5);
const REASON = 'PO sent by email, "late"\nsee thread';

const get = (query: string): Request =>
  new Request(`http://localhost/api/export${query}`);

describe("export", () => {
  let db: Db;
  let logged: Record<string, unknown>[];

  const config = (): ExportConfig => ({ db: () => db, clock: () => NOW });

  const lines = async (response: Response): Promise<string[]> =>
    new TextDecoder()
      .decode(await response.arrayBuffer())
      .replace(/^﻿/, "")
      .split("\r\n");

  beforeEach(() => {
    db = openDb(":memory:");
    logged = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      logged.push(JSON.parse(String(chunk)) as Record<string, unknown>);
      return true;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("readExport (AC-12)", () => {
    it("is null before the first run", () => {
      expect(readExport(db)).toBeNull();
    });

    it("reads the run, headline, findings and totals in one transaction", () => {
      runSampleAudit(db, () => TEST_NOW);
      const transaction = vi.spyOn(db, "transaction");
      const snapshot = readExport(db);
      expect(transaction).toHaveBeenCalledOnce();
      expect(snapshot?.findings).toHaveLength(8);
      expect(snapshot?.headline.recoverableCents).toBe(976_685);
      expect(snapshot?.totals).toEqual({
        approvedCents: 0,
        pendingCount: 8,
        findingCount: 8,
      });
    });
  });

  describe("handleExportRequest", () => {
    it.each(["", "?format=pdf", "?format=XLSX", "?format=xlsx%20"])(
      "answers 400 for %j and logs bad_format (AC-3, AC-14)",
      async (query) => {
        runSampleAudit(db, () => TEST_NOW);
        const response = await handleExportRequest(get(query), config());
        expect(response.status).toBe(400);
        expect(await response.text()).toBe("format must be xlsx or csv");
        expect(response.headers.get("content-type")).toBe(
          "text/plain; charset=utf-8",
        );
        expect(response.headers.get("cache-control")).toBe("no-store");
        expect(logged).toEqual([
          {
            event: "export",
            format: null,
            outcome: "bad_format",
            ms: 0,
            at: expect.any(String),
          },
        ]);
      },
    );

    it("answers 404 with no run and logs no_run (AC-3, AC-14)", async () => {
      const response = await handleExportRequest(get("?format=csv"), config());
      expect(response.status).toBe(404);
      expect(await response.text()).toBe("No audit run yet");
      expect(response.headers.get("content-type")).toBe(
        "text/plain; charset=utf-8",
      );
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(logged).toEqual([
        {
          event: "export",
          format: "csv",
          outcome: "no_run",
          ms: 0,
          at: expect.any(String),
        },
      ]);
    });

    it("answers a run with no findings with the header and zero totals, not 404 (AC-4, AC-8)", async () => {
      saveAuditRun(db, { startedAt: TEST_NOW, finishedAt: TEST_NOW }, []);
      const response = await handleExportRequest(get("?format=csv"), config());
      expect(response.status).toBe(200);
      const [header, ...rest] = await lines(response);
      expect(header.startsWith("Supplier,Invoice,")).toBe(true);
      expect(rest).toEqual([
        "",
        "Total recoverable,,,,,0.00,,,,,",
        "Total approved,,,,,0.00,,,,,",
        "",
      ]);
    });

    it("serves the sample csv with the brief's numbers and headers (AC-3, AC-10, AC-13)", async () => {
      runSampleAudit(db, () => TEST_NOW);
      const response = await handleExportRequest(get("?format=csv"), config());
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe(
        "text/csv; charset=utf-8",
      );
      expect(response.headers.get("content-disposition")).toBe(
        'attachment; filename="overpayment-findings-2026-09-27.csv"',
      );
      expect(response.headers.get("cache-control")).toBe("no-store");
      const all = await lines(response);
      const rows = all.slice(1, 9);
      expect(rows[0]).toMatch(
        /^[^,]+,NL88310,Duplicate invoice,Recover,.*,8141\.00,.*,Pending,,$/,
      );
      expect(rows[7]).toMatch(
        /^[^,]+,BW-5530,Missing reference,Review only,.*,0\.00,.*,Pending,,$/,
      );
      expect(all.slice(9)).toEqual([
        "",
        "Total recoverable,,,,,9766.85,,,,,",
        "Total approved,,,,,0.00,,,,,",
        "",
      ]);
      expect(logged).toEqual([
        {
          event: "export",
          format: "csv",
          outcome: "ok",
          findingCount: 8,
          ms: 0,
          at: expect.any(String),
        },
      ]);
    });

    it("reflects the analyst's decisions in both files (AC-6, AC-8, AC-13)", async () => {
      runSampleAudit(db, () => TEST_NOW);
      const decidedAt = Date.UTC(2026, 8, 27, 11, 42);
      listFindings(db).forEach((finding) => {
        const rejected = finding.invoiceNumber === "BW-5530";
        decide(
          db,
          {
            findingKey: finding.findingKey,
            status: rejected ? "rejected" : "approved",
            reason: rejected ? REASON : null,
          },
          decidedAt,
        );
      });

      const csv = (
        await lines(await handleExportRequest(get("?format=csv"), config()))
      ).join("\r\n");
      expect(csv).toContain(
        `,Rejected,"PO sent by email, ""late""\nsee thread",2026-09-27 11:42`,
      );
      expect(csv).toContain("Total approved,,,,,9766.85,,,,,");

      const response = await handleExportRequest(get("?format=xlsx"), config());
      expect(response.headers.get("content-type")).toBe(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      expect(response.headers.get("content-disposition")).toBe(
        'attachment; filename="overpayment-findings-2026-09-27.xlsx"',
      );
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(
        (await response.arrayBuffer()) as unknown as ExcelJS.Buffer,
      );
      const findings = workbook.getWorksheet("Findings");
      const summary = workbook.getWorksheet("Summary");
      expect(findings?.getRow(2).getCell(2).value).toBe("NL88310");
      expect(findings?.getRow(2).getCell(6).value).toBe(8141);
      expect(findings?.getRow(9).getCell(2).value).toBe("BW-5530");
      expect(findings?.getRow(9).getCell(9).value).toBe("Rejected");
      expect(findings?.getRow(9).getCell(10).value).toBe(REASON);
      expect(findings?.getRow(11).getCell(6).value).toBe(9766.85);
      expect(findings?.getRow(12).getCell(6).value).toBe(9766.85);
      expect(summary?.getRow(8).getCell(2).value).toBe("0 of 8");
      expect(summary?.getRow(9).getCell(2).value).toBe("18.1%");
    });

    it("reads Pending 8 of 8 on a fresh sample in the Summary sheet (AC-13)", async () => {
      runSampleAudit(db, () => TEST_NOW);
      const response = await handleExportRequest(get("?format=xlsx"), config());
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(
        (await response.arrayBuffer()) as unknown as ExcelJS.Buffer,
      );
      const summary = workbook.getWorksheet("Summary");
      expect(summary?.getRow(8).getCell(2).value).toBe("8 of 8");
      expect(summary?.getRow(7).getCell(2).value).toBe(0);
    });
  });
});
