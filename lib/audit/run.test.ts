import { beforeEach, describe, expect, it } from "vitest";
import { listFindings } from "@/lib/db/audit";
import { openDb, type Db } from "@/lib/db/client";
import { auditRuns } from "@/lib/db/schema";
import { seedBriefSample, TEST_NOW } from "@/lib/db/testing";
import { BRIEF_INVOICED_TOTAL_CENTS } from "@/lib/schemas/fixtures/brief-sample";
import { runAudit } from "./run";

/** A clock that ticks 250 ms per read, so start and finish differ. */
const tickingClock = (start: number) => {
  let reads = 0;
  return () => start + 250 * reads++;
};

describe("runAudit", () => {
  let db: Db;
  beforeEach(() => {
    db = openDb(":memory:");
  });

  it("runs the checks over the stored records and stores the run", () => {
    seedBriefSample(db);
    const { runId, summary } = runAudit(db, tickingClock(TEST_NOW));

    expect(summary).toEqual({
      invoiceCount: 6,
      invoicedTotalCents: BRIEF_INVOICED_TOTAL_CENTS,
      recoverableCents: 976685,
      blockedCents: 0,
      findingCount: 8,
      recoverableShare: "18.1%",
    });
    const run = db.select().from(auditRuns).get();
    expect(run).toMatchObject({
      id: runId,
      startedAt: TEST_NOW,
      finishedAt: TEST_NOW + 250,
      recoverableTotalCents: 976685,
      findingCount: 8,
    });
    expect(listFindings(db)).toHaveLength(8);
  });

  it("stores an empty run when nothing is loaded", () => {
    const { summary } = runAudit(db, tickingClock(TEST_NOW));
    expect(summary.findingCount).toBe(0);
    expect(summary.recoverableShare).toBe("0.0%");
    expect(listFindings(db)).toEqual([]);
  });
});
