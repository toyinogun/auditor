import { describe, expect, it } from "vitest";
import { openDb } from "@/lib/db/client";
import { TEST_NOW } from "@/lib/db/testing";
import { headlineText, latestHeadline } from "./headline";
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

describe("headlineText", () => {
  it("says No audit yet with no run", () => {
    expect(headlineText(null)).toBe("No audit yet");
  });

  it("writes the brief's headline", () => {
    expect(
      headlineText({
        findingCount: 8,
        recoverableCents: 976_685,
        invoicedTotalCents: 5_393_960,
        recoverableShare: "18.1%",
      }),
    ).toBe("8 findings, $9,766.85 recoverable of $53,939.60 invoiced (18.1%)");
  });

  it("uses the singular for one finding", () => {
    expect(
      headlineText({
        findingCount: 1,
        recoverableCents: 0,
        invoicedTotalCents: 100,
        recoverableShare: "0.0%",
      }),
    ).toBe("1 finding, $0.00 recoverable of $1.00 invoiced (0.0%)");
  });
});
