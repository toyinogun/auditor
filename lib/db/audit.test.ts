import { beforeEach, describe, expect, it } from "vitest";
import { findingKey } from "@/lib/schemas/keys";
import type { Finding } from "@/lib/schemas/finding";
import { BRIEF_INVOICED_TOTAL_CENTS } from "@/lib/schemas/fixtures/brief-sample";
import { resetAll } from "./admin";
import { decide, latestAuditRun, listFindings, saveAuditRun } from "./audit";
import { openDb, type Db } from "./client";
import { loadAuditInput } from "./records";
import * as schema from "./schema";
import { seedBriefSample, TEST_NOW } from "./testing";

const RUN = { startedAt: TEST_NOW, finishedAt: TEST_NOW + 900 };

/** Two findings shaped like the checks will produce them, built from stored records. */
const sampleFindings = (db: Db): readonly Finding[] => {
  const { invoices, contracts } = loadAuditInput(db);
  const nl88310 = invoices.find(
    (invoice) => invoice.invoiceNumber === "NL-88310",
  );
  const bw5530 = invoices.find(
    (invoice) => invoice.invoiceNumber === "BW-5530",
  );
  if (!nl88310 || !bw5530) throw new Error("sample invoices missing");
  return [
    {
      findingKey: findingKey({
        check: "contract_price",
        supplierKey: nl88310.supplierKey,
        invoiceNumber: nl88310.invoiceNumber,
        detail: "NL-BRG-6204",
      }),
      checkId: "contract_price",
      action: "recover",
      invoiceDocumentId: nl88310.documentId,
      amountCents: 37500,
      title: "Bearing price above contract",
      calculation: "($5.10 − $4.85) × 1,500 = $375.00",
      evidence: [
        {
          label: "Contract price",
          value: "$4.85",
          source: {
            documentId: contracts[0].documentId,
            filename: contracts[0].filename,
            locator: "Schedule A, item 1",
          },
        },
      ],
    },
    {
      findingKey: findingKey({
        check: "missing_reference",
        supplierKey: bw5530.supplierKey,
        invoiceNumber: "BW-5530",
      }),
      checkId: "missing_reference",
      action: "review_only",
      invoiceDocumentId: bw5530.documentId,
      amountCents: 0,
      title: "Invoice has no PO",
      calculation: "No PO number printed",
      evidence: [
        {
          label: "PO number",
          value: "none",
          source: {
            documentId: bw5530.documentId,
            filename: bw5530.filename,
            locator: "PO number",
          },
        },
      ],
    },
  ];
};

describe("saveAuditRun (AC-12)", () => {
  let db: Db;
  beforeEach(() => {
    db = openDb(":memory:");
    seedBriefSample(db);
  });

  it("writes one run with the invoiced and recoverable totals", () => {
    const runId = saveAuditRun(db, RUN, sampleFindings(db));
    const [run] = db.select().from(schema.auditRuns).all();
    expect(run).toEqual({
      id: runId,
      ...RUN,
      invoiceCount: 6,
      invoicedTotalCents: BRIEF_INVOICED_TOTAL_CENTS,
      recoverableTotalCents: 37500,
      findingCount: 2,
    });
  });

  it("counts only recover findings in the recoverable total (spec 0004, AC-6)", () => {
    const [recover, review] = sampleFindings(db);
    const blocked: Finding = {
      ...recover,
      findingKey: `${recover.findingKey}-blocked`,
      action: "block_payment",
      amountCents: 814100,
    };
    saveAuditRun(db, RUN, [recover, blocked, review]);
    const [run] = db.select().from(schema.auditRuns).all();
    expect(run.recoverableTotalCents).toBe(37500);
    expect(run.findingCount).toBe(3);
  });

  it("leaves exactly one set of findings when run twice", () => {
    saveAuditRun(db, RUN, sampleFindings(db));
    const second = saveAuditRun(db, RUN, sampleFindings(db));
    const stored = listFindings(db);
    expect(stored).toHaveLength(2);
    expect(stored.every((finding) => finding.runId === second)).toBe(true);
  });

  it("lists largest amount first with evidence parsed back", () => {
    const findings = sampleFindings(db);
    saveAuditRun(db, RUN, findings);
    const [first, second] = listFindings(db);
    expect(first).toMatchObject({
      ...findings[0],
      decision: { status: "pending" },
    });
    expect(second.amountCents).toBe(0);
  });

  it("rolls back the whole run when a finding names a document with no invoice", () => {
    saveAuditRun(db, RUN, sampleFindings(db));
    const [bad] = sampleFindings(db);
    expect(() =>
      saveAuditRun(db, RUN, [{ ...bad, invoiceDocumentId: 999 }]),
    ).toThrow(/no invoice/);
    expect(listFindings(db)).toHaveLength(2);
    expect(db.select().from(schema.auditRuns).all()).toHaveLength(1);
  });

  it("throws on a finding without evidence (a bug in the checks) and changes nothing", () => {
    saveAuditRun(db, RUN, sampleFindings(db));
    const [bad] = sampleFindings(db);
    expect(() => saveAuditRun(db, RUN, [{ ...bad, evidence: [] }])).toThrow();
    expect(listFindings(db)).toHaveLength(2);
  });
});

describe("decide (AC-13)", () => {
  let db: Db;
  let key: string;
  beforeEach(() => {
    db = openDb(":memory:");
    seedBriefSample(db);
    saveAuditRun(db, RUN, sampleFindings(db));
    key = sampleFindings(db)[0].findingKey;
  });

  it("keeps an approval on the same finding after a rerun", () => {
    expect(
      decide(
        db,
        { findingKey: key, status: "approved", reason: null },
        TEST_NOW,
      ),
    ).toMatchObject({
      ok: true,
      value: { amountCents: 37500 },
    });
    saveAuditRun(db, RUN, sampleFindings(db));
    expect(listFindings(db)[0].decision).toEqual({
      status: "approved",
      reason: null,
      decidedAt: TEST_NOW,
    });
  });

  it("reads pending again when the rerun changes the finding's amount", () => {
    decide(db, { findingKey: key, status: "approved", reason: null }, TEST_NOW);
    const [changed, other] = sampleFindings(db);
    saveAuditRun(db, RUN, [{ ...changed, amountCents: 40000 }, other]);
    expect(listFindings(db)[0].decision).toEqual({ status: "pending" });
  });

  it("switches from approved to rejected with a trimmed reason", () => {
    decide(db, { findingKey: key, status: "approved", reason: null }, TEST_NOW);
    decide(
      db,
      {
        findingKey: key,
        status: "rejected",
        reason: "  Credit note CN-12 issued ",
      },
      TEST_NOW + 1,
    );
    expect(listFindings(db)[0].decision).toEqual({
      status: "rejected",
      reason: "Credit note CN-12 issued",
      decidedAt: TEST_NOW + 1,
    });
  });

  it.each([null, "", "   "])("refuses a reject with reason %j", (reason) => {
    const result = decide(db, { findingKey: key, status: "rejected", reason });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("reason");
    expect(listFindings(db)[0].decision).toEqual({ status: "pending" });
  });

  it("refuses an unknown finding key", () => {
    expect(
      decide(db, { findingKey: "nope", status: "approved", reason: null }).ok,
    ).toBe(false);
  });
});

describe("resetAll (AC-14)", () => {
  it("empties every table, decisions included", () => {
    const db = openDb(":memory:");
    seedBriefSample(db);
    saveAuditRun(db, RUN, sampleFindings(db));
    decide(db, {
      findingKey: sampleFindings(db)[0].findingKey,
      status: "approved",
      reason: null,
    });
    resetAll(db);
    const tables = Object.values(schema).filter(
      (value) => typeof value === "object",
    );
    const counts = tables.map(
      (table) =>
        db
          .select()
          .from(table as typeof schema.documents)
          .all().length,
    );
    expect(tables).toHaveLength(15);
    expect(counts.every((n) => n === 0)).toBe(true);
  });
});

describe("latestAuditRun", () => {
  let db: Db;
  beforeEach(() => {
    db = openDb(":memory:");
  });

  it("is null before any run, then the newest run", () => {
    expect(latestAuditRun(db)).toBeNull();
    seedBriefSample(db);
    saveAuditRun(db, { startedAt: TEST_NOW, finishedAt: TEST_NOW }, []);
    const second = saveAuditRun(
      db,
      { startedAt: TEST_NOW + 1, finishedAt: TEST_NOW + 2 },
      [],
    );
    expect(latestAuditRun(db)).toMatchObject({
      id: second,
      findingCount: 0,
      invoicedTotalCents: BRIEF_INVOICED_TOTAL_CENTS,
      recoverableTotalCents: 0,
    });
  });
});
