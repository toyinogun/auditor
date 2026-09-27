import { describe, expect, it } from "vitest";
import { DecisionInput, Finding } from "./finding";

const evidence = {
  label: "Contract price",
  value: "$4.85",
  source: {
    documentId: 3,
    filename: "C-2026-014.pdf",
    locator: "Schedule A, item 1",
  },
};

const finding = {
  findingKey: "contract_price:northline industrial supply:NL-88310:NL-BRG-6204",
  checkId: "contract_price",
  action: "recover",
  invoiceDocumentId: 9,
  amountCents: 37500,
  title: "Bearing price above contract",
  calculation: "($5.10 − $4.85) × 1,500 = $375.00",
  evidence: [evidence],
};

describe("Finding", () => {
  it("accepts a finding with evidence", () => {
    expect(Finding.safeParse(finding).success).toBe(true);
  });

  it("requires at least one evidence item", () => {
    expect(Finding.safeParse({ ...finding, evidence: [] }).success).toBe(false);
  });

  it("refuses a fractional or negative amount", () => {
    expect(Finding.safeParse({ ...finding, amountCents: 1.5 }).success).toBe(
      false,
    );
    expect(Finding.safeParse({ ...finding, amountCents: -1 }).success).toBe(
      false,
    );
  });
});

describe("DecisionInput", () => {
  const key = finding.findingKey;

  it("accepts an approval without a reason", () => {
    expect(
      DecisionInput.safeParse({
        findingKey: key,
        status: "approved",
        reason: null,
      }).success,
    ).toBe(true);
  });

  it("accepts a rejection with a reason", () => {
    expect(
      DecisionInput.safeParse({
        findingKey: key,
        status: "rejected",
        reason: "Credit note issued",
      }).success,
    ).toBe(true);
  });

  it.each([null, "", "   "])("refuses a rejection with reason %j", (reason) => {
    expect(
      DecisionInput.safeParse({ findingKey: key, status: "rejected", reason })
        .success,
    ).toBe(false);
  });
});
