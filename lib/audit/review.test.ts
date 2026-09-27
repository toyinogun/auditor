import { describe, expect, it } from "vitest";
import { decide, listFindings, type FindingView } from "@/lib/db/audit";
import { openDb } from "@/lib/db/client";
import { TEST_NOW } from "@/lib/db/testing";
import type { DecisionState } from "@/lib/schemas/finding";
import { nextPendingKey, reviewTotals } from "./review";
import { runSampleAudit } from "./sample";

const APPROVED: DecisionState = {
  status: "approved",
  reason: null,
  decidedAt: 1,
};
const REJECTED: DecisionState = {
  status: "rejected",
  reason: "Credit note issued",
  decidedAt: 1,
};
const PENDING: DecisionState = { status: "pending" };

const view = (
  findingKey: string,
  amountCents: number,
  decision: DecisionState = PENDING,
  action: FindingView["action"] = "recover",
): FindingView => ({
  id: 1,
  runId: 1,
  supplierName: "Northline",
  invoiceNumber: "NL-1",
  findingKey,
  checkId: "contract_price",
  action,
  invoiceDocumentId: 1,
  amountCents,
  title: findingKey,
  calculation: "x",
  evidence: [
    {
      label: "Billed unit price",
      value: "$1.00",
      source: { documentId: 1, filename: "NL-1.pdf", locator: "line 1" },
    },
  ],
  decision,
});

describe("reviewTotals (spec 0008, AC-1)", () => {
  it("is all zero for no findings", () => {
    expect(reviewTotals([])).toEqual({
      approvedCents: 0,
      pendingCount: 0,
      findingCount: 0,
    });
  });

  it("sums approved recover findings and counts pending ones", () => {
    expect(
      reviewTotals([
        view("a", 814_100, APPROVED),
        view("b", 39_000, REJECTED),
        view("c", 37_500),
        view("d", 25_000, APPROVED),
      ]),
    ).toEqual({ approvedCents: 839_100, pendingCount: 1, findingCount: 4 });
  });

  it("adds nothing for approved block_payment and review_only findings", () => {
    expect(
      reviewTotals([
        view("a", 814_100, APPROVED, "block_payment"),
        view("b", 0, APPROVED, "review_only"),
      ]).approvedCents,
    ).toBe(0);
  });

  it("counts a stale decision as pending, since listFindings reads it so", () => {
    // A decision made on an old amount comes back from listFindings as pending.
    expect(reviewTotals([view("a", 40_000, PENDING)])).toEqual({
      approvedCents: 0,
      pendingCount: 1,
      findingCount: 1,
    });
  });
});

describe("nextPendingKey (spec 0008, AC-8)", () => {
  const list = [
    view("a", 4, APPROVED),
    view("b", 3),
    view("c", 2, REJECTED),
    view("d", 1),
  ];

  it("returns the first pending finding after the current one", () => {
    expect(nextPendingKey(list, "b")).toBe("d");
  });

  it("skips decided rows", () => {
    expect(nextPendingKey(list, "a")).toBe("b");
  });

  it("wraps to the top", () => {
    expect(nextPendingKey(list, "d")).toBe("b");
  });

  it("returns the current key when it is the only pending one", () => {
    expect(nextPendingKey([view("a", 2, APPROVED), view("b", 1)], "b")).toBe(
      "b",
    );
  });

  it("starts from the top when the current key is gone", () => {
    expect(nextPendingKey(list, "gone")).toBe("b");
  });

  it("is null when every finding is decided", () => {
    expect(
      nextPendingKey([view("a", 2, APPROVED), view("b", 1, REJECTED)], "a"),
    ).toBeNull();
    expect(nextPendingKey([], "a")).toBeNull();
  });
});

describe("the brief sample under review (spec 0008, AC-16)", () => {
  it("reads $0.00 and 8 of 8, then $9,766.85 and 0 of 8 once all are decided", () => {
    const db = openDb(":memory:");
    runSampleAudit(db, () => TEST_NOW);
    const fresh = listFindings(db);
    expect(fresh.map((f) => [f.invoiceNumber, f.amountCents])).toEqual([
      ["NL88310", 814_100],
      ["NL-88203", 39_000],
      ["NL-88310", 37_500],
      ["BW-5521", 31_110],
      ["NL-88203", 25_000],
      ["NL-88310", 18_500],
      ["NL-88310", 11_475],
      ["BW-5530", 0],
    ]);
    expect(reviewTotals(fresh)).toEqual({
      approvedCents: 0,
      pendingCount: 8,
      findingCount: 8,
    });

    fresh.forEach((finding) =>
      decide(
        db,
        finding.action === "review_only"
          ? {
              findingKey: finding.findingKey,
              status: "rejected",
              reason: "PO added by hand",
            }
          : {
              findingKey: finding.findingKey,
              status: "approved",
              reason: null,
            },
        TEST_NOW,
      ),
    );
    expect(reviewTotals(listFindings(db))).toEqual({
      approvedCents: 976_685,
      pendingCount: 0,
      findingCount: 8,
    });
  });
});
