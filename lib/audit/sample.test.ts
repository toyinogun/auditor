import { beforeEach, describe, expect, it, vi } from "vitest";
import { decide, listFindings } from "@/lib/db/audit";
import { openDb, type Db } from "@/lib/db/client";
import { auditRuns, decisions, documents, findings } from "@/lib/db/schema";
import { TEST_NOW } from "@/lib/db/testing";
import { BRIEF_INVOICED_TOTAL_CENTS } from "@/lib/schemas/fixtures/brief-sample";
import { SAMPLE_MANIFEST_FILE_COUNT } from "@/lib/schemas/sample-manifest";
import {
  loadSample,
  loadSampleData,
  runSampleAudit,
  SAMPLE_LOAD_FAILED,
  SAMPLE_MANIFEST,
} from "./sample";

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

describe("loadSampleData (spec 0007, AC-12)", () => {
  const logged = (): readonly unknown[] =>
    vi
      .mocked(process.stdout.write)
      .mock.calls.map(([chunk]) => JSON.parse(String(chunk)));

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  it("returns the finding count and recoverable total, and logs one event", async () => {
    const db = openDb(":memory:");
    const result = await loadSampleData(
      db,
      { clear: async () => undefined },
      clock,
    );

    expect(result).toEqual({
      ok: true,
      value: { findingCount: 8, recoverableCents: 976685 },
    });
    expect(logged()).toEqual([
      expect.objectContaining({
        event: "sample_loaded",
        outcome: "ok",
        findingCount: 8,
      }),
    ]);
  });

  it("returns an error and keeps the previous run when the load throws", async () => {
    const db = openDb(":memory:");
    runSampleAudit(db, clock);
    const before = findingKeys(db);
    const broken = {
      files: SAMPLE_MANIFEST.files.filter(
        (file) => file.filename !== "receipts.csv",
      ),
    };

    const result = await loadSampleData(
      db,
      { clear: async () => undefined },
      clock,
      broken,
    );

    expect(result).toEqual({ ok: false, error: SAMPLE_LOAD_FAILED });
    expect(findingKeys(db)).toEqual(before);
    expect(db.select().from(auditRuns).all()).toHaveLength(1);
    expect(logged()).toEqual([
      expect.objectContaining({ event: "sample_loaded", outcome: "failed" }),
    ]);
  });

  it("empties the uploads folder once, after the new run has committed (AC-12)", async () => {
    const db = openDb(":memory:");
    const runsSeenByClear: number[] = [];
    const clear = vi.fn(async () => {
      runsSeenByClear.push(db.select().from(auditRuns).all().length);
    });

    await loadSampleData(db, { clear }, clock);

    expect(clear).toHaveBeenCalledTimes(1);
    expect(runsSeenByClear).toEqual([1]);
    expect(logged()).toEqual([
      expect.objectContaining({ outcome: "ok", uploadsCleared: true }),
    ]);
  });

  it("leaves the uploads folder alone when the audit fails (AC-12)", async () => {
    const db = openDb(":memory:");
    const clear = vi.fn(async () => undefined);
    const broken = {
      files: SAMPLE_MANIFEST.files.filter(
        (file) => file.filename !== "receipts.csv",
      ),
    };

    const result = await loadSampleData(db, { clear }, clock, broken);

    expect(result).toEqual({ ok: false, error: SAMPLE_LOAD_FAILED });
    expect(clear).not.toHaveBeenCalled();
    expect(logged()).toEqual([
      expect.objectContaining({
        outcome: "failed",
        findingCount: null,
        error: "Error",
      }),
    ]);
  });

  it("still counts the load as done when the clear rejects with a non Error value (AC-12)", async () => {
    const db = openDb(":memory:");
    const clear = (): Promise<void> => Promise.reject("disk gone");

    const result = await loadSampleData(db, { clear }, clock);

    expect(result.ok).toBe(true);
    expect(logged()).toEqual([
      expect.objectContaining({ outcome: "ok", uploadsCleared: false }),
    ]);
  });

  it("counts the load as done when only emptying the uploads folder fails", async () => {
    const db = openDb(":memory:");
    runSampleAudit(db, () => TEST_NOW - 1);
    const [finding] = listFindings(db);
    decide(db, {
      findingKey: finding.findingKey,
      status: "approved",
      reason: null,
    });
    const clear = async (): Promise<void> => {
      throw new Error("EACCES: permission denied");
    };

    const result = await loadSampleData(db, { clear }, clock);

    // The new run committed before the clear, so it is live and the result says so.
    expect(result).toEqual({
      ok: true,
      value: { findingCount: 8, recoverableCents: 976685 },
    });
    expect(db.select().from(auditRuns).get()?.startedAt).toBe(TEST_NOW);
    expect(db.select().from(decisions).all()).toHaveLength(0);
    expect(logged()).toEqual([
      expect.objectContaining({
        event: "sample_loaded",
        outcome: "ok",
        findingCount: 8,
        uploadsCleared: false,
      }),
    ]);
  });
});
