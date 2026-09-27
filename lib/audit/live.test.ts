import { beforeEach, describe, expect, it, vi } from "vitest";
import { listFindings } from "@/lib/db/audit";
import { openDb, type Db } from "@/lib/db/client";
import { auditRuns, documents } from "@/lib/db/schema";
import { TEST_NOW } from "@/lib/db/testing";
import { fakeMessage, fixtureClient, readSample } from "@/lib/extract/testing";
import { BRIEF_SAMPLE } from "@/lib/schemas/fixtures/brief-sample";
import { BRIEF_SUMMARY, runLiveAudit } from "./live";
import { runSampleAudit, SAMPLE_MANIFEST } from "./sample";

vi.mock("@/lib/log", () => ({ logEvent: vi.fn() }));

const clock = () => TEST_NOW;

const NL_88203 = BRIEF_SAMPLE.invoices[1];

/** NL-88203 read with its first line price changed, the same both times: it still converts. */
const misread = () => {
  const [line, ...rest] = NL_88203.extraction.lines;
  const input = {
    ...NL_88203.extraction,
    lines: [{ ...line, unitPrice: "0.96", amount: "4800.00" }, ...rest],
    subtotal: "10590.00",
    charges: [{ ...NL_88203.extraction.charges[0], amount: "264.75" }],
    total: "10854.75",
  };
  return fakeMessage([
    { type: "tool_use", id: "toolu_x", name: "record_invoice", input } as never,
  ]);
};

describe("runLiveAudit", () => {
  let db: Db;
  beforeEach(() => {
    db = openDb(":memory:");
  });

  it("stores 8 findings and $9,766.85 when every document reads like the fixture (AC-9, AC-10)", async () => {
    const extract = await fixtureClient();
    const report = await runLiveAudit(db, SAMPLE_MANIFEST, {
      extract,
      readFile: readSample,
      clock,
    });

    expect(report.mismatches).toEqual([]);
    expect(report.outcomes.every((outcome) => outcome.result.ok)).toBe(true);
    expect(report.stored?.summary).toMatchObject(BRIEF_SUMMARY);
    expect(listFindings(db)).toHaveLength(8);
    expect(extract.calls()).toBe(12);
  });

  it("numbers documents in manifest order, as the offline run does", async () => {
    const offlineDb = openDb(":memory:");
    runSampleAudit(offlineDb, clock);
    const ids = (target: Db) =>
      target
        .select()
        .from(documents)
        .all()
        .map((doc) => [doc.filename, doc.id]);
    await runLiveAudit(db, SAMPLE_MANIFEST, {
      extract: await fixtureClient(),
      readFile: readSample,
      clock,
    });
    expect(ids(db)).toEqual(ids(offlineDb));
  });

  it("stores the text layer flag: 0 for the scan, 1 for every other PDF (AC-10, AC-11)", async () => {
    await runLiveAudit(db, SAMPLE_MANIFEST, {
      extract: await fixtureClient(),
      readFile: readSample,
      clock,
    });
    const flags = db
      .select()
      .from(documents)
      .all()
      .filter((doc) => doc.mimeType === "application/pdf")
      .map((doc) => [doc.filename, doc.hasTextLayer, doc.status]);
    flags.forEach(([filename, hasTextLayer, status]) => {
      expect(status).toBe("done");
      expect(hasTextLayer).toBe(filename !== "NL88310.pdf");
    });
    expect(flags).toHaveLength(12);
  });

  it("leaves an earlier run intact when one extraction fails (AC-10)", async () => {
    runSampleAudit(db, clock);
    const before = db.select().from(auditRuns).all();
    const report = await runLiveAudit(db, SAMPLE_MANIFEST, {
      extract: await fixtureClient(
        new Map([["BW-5521.pdf", [fakeMessage([], "refusal")]]]),
      ),
      readFile: readSample,
      clock: () => TEST_NOW + 1,
    });

    expect(report.stored).toBeNull();
    expect(
      report.outcomes.find((o) => o.filename === "BW-5521.pdf")?.result.ok,
    ).toBe(false);
    expect(report.outcomes).toHaveLength(14);
    expect(db.select().from(auditRuns).all()).toEqual(before);
    expect(listFindings(db)).toHaveLength(8);
  });

  it("reports a record the database refuses, and leaves an earlier run intact (AC-10)", async () => {
    runSampleAudit(db, clock);
    const before = db.select().from(auditRuns).all();
    const overlapping = fakeMessage([
      {
        type: "tool_use",
        id: "toolu_x",
        name: "record_contract",
        input: BRIEF_SAMPLE.contracts[0].extraction,
      } as never,
    ]);
    const report = await runLiveAudit(db, SAMPLE_MANIFEST, {
      extract: await fixtureClient(new Map([["BW-5521.pdf", [overlapping]]])),
      readFile: readSample,
      clock: () => TEST_NOW + 1,
    });

    expect(report.stored).toBeNull();
    expect(report.outcomes).toHaveLength(14);
    const failed = report.outcomes.filter((o) => !o.result.ok);
    expect(failed.map((o) => [o.filename, o.result])).toEqual([
      [
        "C-2026-014.pdf",
        {
          ok: false,
          error: expect.stringMatching(
            /^not stored: contract C-2026-014 .* overlaps C-2026-014/,
          ),
        },
      ],
    ]);
    expect(
      report.outcomes.find((o) => o.filename === "BW-5521.pdf")?.result,
    ).toEqual({ ok: true, value: "contract, attempts 1" });
    expect(db.select().from(auditRuns).all()).toEqual(before);
    expect(listFindings(db)).toHaveLength(8);
  });

  it("does not store when a CSV fails to parse", async () => {
    const readFile = async (filename: string) =>
      filename === "receipts.csv"
        ? new TextEncoder().encode(
            "po_number,SKU,quantity_received,received_date\n",
          )
        : readSample(filename);
    const report = await runLiveAudit(db, SAMPLE_MANIFEST, {
      extract: await fixtureClient(),
      readFile,
      clock,
    });
    expect(report.stored).toBeNull();
    expect(
      report.outcomes.find((o) => o.filename === "receipts.csv")?.result,
    ).toEqual({
      ok: false,
      error: "receipts.csv: column 2: expected sku, found SKU",
    });
    expect(db.select().from(documents).all()).toEqual([]);
  });

  it("still stores a run whose records differ, and names each difference (AC-9, AC-10)", async () => {
    const report = await runLiveAudit(db, SAMPLE_MANIFEST, {
      extract: await fixtureClient(new Map([["NL-88203.pdf", [misread()]]])),
      readFile: readSample,
      clock,
    });
    expect(report.stored).not.toBeNull();
    const lines = report.mismatches.map((m) => `${m.filename}: ${m.path}`);
    expect(lines).toContain("NL-88203.pdf: lines[0].unitPriceCents");
    expect(
      lines.some((line) => line.startsWith("NL-88203.pdf: finding ")),
    ).toBe(true);
    expect(lines.some((line) => line.startsWith("summary: "))).toBe(true);
  });
});
