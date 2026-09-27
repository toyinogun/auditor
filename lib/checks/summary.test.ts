import { describe, expect, it } from "vitest";
import type { Finding } from "@/lib/schemas/finding";
import { briefSampleRecords } from "@/lib/schemas/fixtures/brief-sample-records";
import { recoverableShareText, summarizeFindings } from "./summary";

const finding = (
  action: Finding["action"],
  amountCents: number,
  key: string,
): Finding => ({
  findingKey: key,
  checkId: "contract_price",
  action,
  invoiceDocumentId: 7,
  amountCents,
  title: "t",
  calculation: "c",
  evidence: [
    {
      label: "l",
      value: "v",
      source: { documentId: 7, filename: "f", locator: "line 1" },
    },
  ],
});

describe("summarizeFindings (AC-2, AC-6)", () => {
  const { invoices } = briefSampleRecords();

  it("sums recover and block findings separately", () => {
    const summary = summarizeFindings(invoices, [
      finding("recover", 162585, "a"),
      finding("block_payment", 814100, "b"),
      finding("review_only", 0, "c"),
    ]);
    expect(summary).toEqual({
      invoiceCount: 6,
      invoicedTotalCents: 5393960,
      recoverableCents: 162585,
      blockedCents: 814100,
      findingCount: 3,
      recoverableShare: "3.0%",
    });
  });

  it("rounds the share half away from zero to one decimal", () => {
    // 976685 / 5393960 = 18.107%; 5 / 1000 = 0.5%; 1 / 2000 = 0.05% rounds up to 0.1%.
    expect(
      summarizeFindings(invoices, [finding("recover", 976685, "a")])
        .recoverableShare,
    ).toBe("18.1%");
    const whole = (cents: number) => [{ ...invoices[0], totalCents: cents }];
    expect(
      summarizeFindings(whole(1000), [finding("recover", 5, "a")])
        .recoverableShare,
    ).toBe("0.5%");
    expect(
      summarizeFindings(whole(2000), [finding("recover", 1, "a")])
        .recoverableShare,
    ).toBe("0.1%");
    expect(
      summarizeFindings(whole(100), [finding("recover", 100, "a")])
        .recoverableShare,
    ).toBe("100.0%");
  });

  it("gives zeros and 0.0% with nothing invoiced", () => {
    expect(summarizeFindings([], [])).toEqual({
      invoiceCount: 0,
      invoicedTotalCents: 0,
      recoverableCents: 0,
      blockedCents: 0,
      findingCount: 0,
      recoverableShare: "0.0%",
    });
  });
});

describe("recoverableShareText", () => {
  it.each([
    [976_685, 5_393_960, "18.1%"],
    [0, 0, "0.0%"],
    [1, 2000, "0.1%"],
    [1, 2001, "0.0%"],
    [5_393_960, 5_393_960, "100.0%"],
  ])("%i of %i is %s", (part, whole, expected) => {
    expect(recoverableShareText(part, whole)).toBe(expected);
  });
});
