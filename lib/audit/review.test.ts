import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decide, listFindings, type FindingView } from "@/lib/db/audit";
import { openDb, type Db } from "@/lib/db/client";
import { TEST_NOW } from "@/lib/db/testing";
import type { DecisionState } from "@/lib/schemas/finding";
import { nextPendingKey, recordDecision, reviewTotals } from "./review";
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

describe("recordDecision (spec 0008, AC-8, AC-9, AC-12, AC-15)", () => {
  let db: Db;
  let keys: readonly string[];
  let written: string[];

  beforeEach(() => {
    db = openDb(":memory:");
    runSampleAudit(db, () => TEST_NOW);
    keys = listFindings(db).map((finding) => finding.findingKey);
    written = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      written.push(String(chunk));
      return true;
    });
  });
  afterEach(() => vi.restoreAllMocks());

  const events = (): readonly Record<string, unknown>[] =>
    written
      .map((line) => JSON.parse(line) as Record<string, unknown>)
      .filter((event) => event.event === "finding_decided");

  it("stores an approval and returns the next pending key", () => {
    const result = recordDecision(
      db,
      { findingKey: keys[0], status: "approved", reason: null },
      TEST_NOW,
    );
    expect(result).toEqual({
      ok: true,
      value: { status: "approved", nextFindingKey: keys[1] },
    });
    expect(listFindings(db)[0].decision.status).toBe("approved");
    expect(events()).toEqual([
      expect.objectContaining({
        status: "approved",
        checkId: "duplicate",
        outcome: "ok",
      }),
    ]);
  });

  it("returns null once nothing is pending", () => {
    keys
      .slice(0, -1)
      .forEach((findingKey) =>
        recordDecision(db, { findingKey, status: "approved", reason: null }),
      );
    expect(
      recordDecision(db, {
        findingKey: keys[keys.length - 1],
        status: "rejected",
        reason: "PO added by hand",
      }),
    ).toEqual({
      ok: true,
      value: { status: "rejected", nextFindingKey: null },
    });
  });

  it("refuses a blank reason as invalid_input and never logs the reason", () => {
    const result = recordDecision(db, {
      findingKey: keys[0],
      status: "rejected",
      reason: "  ",
    });
    expect(result).toMatchObject({
      ok: false,
      error: { code: "invalid_input" },
    });
    recordDecision(db, {
      findingKey: keys[1],
      status: "rejected",
      reason: "secret analyst note",
    });
    expect(written.join("")).not.toContain("secret analyst note");
    expect(events().map((event) => event.outcome)).toEqual([
      "invalid_input",
      "ok",
    ]);
  });

  it("saves nothing for a stale key and logs finding_not_found without a checkId", () => {
    const result = recordDecision(db, {
      findingKey: "gone",
      status: "approved",
      reason: null,
    });
    expect(result).toMatchObject({
      ok: false,
      error: { code: "finding_not_found" },
    });
    expect(listFindings(db).every((f) => f.decision.status === "pending")).toBe(
      true,
    );
    const [event] = events();
    expect(event).toMatchObject({
      status: "approved",
      outcome: "finding_not_found",
    });
    expect(event).not.toHaveProperty("checkId");
  });

  it("logs a null status for a malformed input", () => {
    recordDecision(db, "not an object");
    expect(events()).toEqual([
      expect.objectContaining({ status: null, outcome: "invalid_input" }),
    ]);
  });
});
