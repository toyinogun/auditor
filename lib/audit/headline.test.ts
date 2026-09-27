import { describe, expect, it } from "vitest";
import { openDb } from "@/lib/db/client";
import { TEST_NOW } from "@/lib/db/testing";
import { latestHeadline } from "./headline";
import { runSampleAudit } from "./sample";

describe("latestHeadline", () => {
  it("is null before any audit run", () => {
    expect(latestHeadline(openDb(":memory:"))).toBeNull();
  });

  it("reads the newest run: the brief's figures after the sample audit", () => {
    const db = openDb(":memory:");
    runSampleAudit(db, () => TEST_NOW);
    expect(latestHeadline(db)).toEqual({
      findingCount: 8,
      recoverableCents: 976_685,
      invoicedTotalCents: 5_393_960,
      recoverableShare: "18.1%",
    });
  });
});
