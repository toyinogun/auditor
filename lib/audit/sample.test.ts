import { beforeEach, describe, expect, it, vi } from "vitest";
import { decide, listFindings } from "@/lib/db/audit";
import { openDb, type Db } from "@/lib/db/client";
import { auditRuns, decisions, documents, findings } from "@/lib/db/schema";
import { TEST_NOW } from "@/lib/db/testing";
import { BRIEF_INVOICED_TOTAL_CENTS } from "@/lib/schemas/fixtures/brief-sample";
import { SAMPLE_MANIFEST_FILE_COUNT } from "@/lib/schemas/sample-manifest";
import { loadSample, runSampleAudit, SAMPLE_MANIFEST } from "./sample";

const clock = () => TEST_NOW;

const findingKeys = (db: Db): readonly string[] =>
  listFindings(db).map((finding) => finding.findingKey);

describe("runSampleAudit", () => {
  let db: Db;
  beforeEach(() => {
    db = openDb(":memory:");
  });

  it("loads the sample and stores 8 findings totalling $9,766.85", () => {
    const { summary } = runSampleAudit(db, clock);

    expect(summary).toEqual({
      invoiceCount: 6,
      invoicedTotalCents: BRIEF_INVOICED_TOTAL_CENTS,
      recoverableCents: 976685,
      blockedCents: 0,
      findingCount: 8,
      recoverableShare: "18.1%",
    });
    expect(listFindings(db)).toHaveLength(8);
    expect(db.select().from(auditRuns).get()?.recoverableTotalCents).toBe(
      976685,
    );
  });

  it("stores every manifest file as a done sample document with its real hash", () => {
    runSampleAudit(db, clock);
    const stored = db.select().from(documents).all();

    expect(stored).toHaveLength(SAMPLE_MANIFEST_FILE_COUNT);
    SAMPLE_MANIFEST.files.forEach((file) => {
      expect(
        stored.find((doc) => doc.filename === file.filename),
      ).toMatchObject({
        sha256: file.sha256,
        sizeBytes: file.sizeBytes,
        mimeType: file.mimeType,
        kind: file.kind,
        source: "sample",
        status: "done",
      });
    });
  });

  it("replaces the previous run instead of adding a second one", () => {
    runSampleAudit(db, clock);
    const firstKeys = findingKeys(db);
    runSampleAudit(db, clock);

    expect(db.select().from(auditRuns).all()).toHaveLength(1);
    expect(db.select().from(documents).all()).toHaveLength(
      SAMPLE_MANIFEST_FILE_COUNT,
    );
    expect(db.select().from(findings).all()).toHaveLength(8);
    expect(findingKeys(db)).toEqual(firstKeys);
  });

  it("starts clean, so earlier decisions are cleared", () => {
    runSampleAudit(db, clock);
    const [first] = listFindings(db);
    decide(db, { findingKey: first.findingKey, status: "approved" }, TEST_NOW);
    runSampleAudit(db, clock);

    expect(db.select().from(decisions).all()).toEqual([]);
  });

  it("keeps the previous data when the load fails partway", () => {
    runSampleAudit(db, clock);
    const before = findingKeys(db);
    const broken = {
      files: SAMPLE_MANIFEST.files.filter(
        (file) => file.filename !== "receipts.csv",
      ),
    };

    expect(() => runSampleAudit(db, clock, broken)).toThrow(/receipts\.csv/);
    expect(findingKeys(db)).toEqual(before);
    expect(db.select().from(auditRuns).all()).toHaveLength(1);
  });
});

describe("loadSample (spec 0006, AC-14)", () => {
  it("runs the sample audit, then empties the uploads folder", async () => {
    const db = openDb(":memory:");
    const clear = vi.fn(async () => {
      expect(db.select().from(auditRuns).all()).toHaveLength(1);
    });
    const { summary } = await loadSample(db, { clear }, clock);
    expect(summary.findingCount).toBe(8);
    expect(clear).toHaveBeenCalledTimes(1);
  });

  it("leaves the files in place when the load fails", async () => {
    const db = openDb(":memory:");
    const clear = vi.fn(async () => undefined);
    const broken = {
      files: SAMPLE_MANIFEST.files.filter(
        (file) => file.filename !== "receipts.csv",
      ),
    };
    await expect(loadSample(db, { clear }, clock, broken)).rejects.toThrow();
    expect(clear).not.toHaveBeenCalled();
  });
});
