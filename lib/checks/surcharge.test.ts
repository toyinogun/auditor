import { describe, expect, it } from "vitest";
import { briefSampleRecords } from "@/lib/schemas/fixtures/brief-sample-records";
import type { InvoiceChargeRecord, InvoiceRecord } from "@/lib/schemas/records";
import { buildContext } from "./context";
import { checkSurcharges } from "./surcharge";

const sample = briefSampleRecords();
const ctx = buildContext(sample);
const invoice = (number: string): InvoiceRecord => {
  const found = sample.invoices.find((i) => i.invoiceNumber === number);
  if (!found) throw new Error(`no invoice ${number}`);
  return found;
};
const fuel = (lineNo: number, amountCents: number): InvoiceChargeRecord => ({
  lineNo,
  kind: "surcharge",
  surchargeType: "fuel",
  label: "Fuel surcharge",
  rateBps: null,
  amountCents,
});
const withCharges = (
  number: string,
  charges: readonly InvoiceChargeRecord[],
): InvoiceRecord => ({ ...invoice(number), charges });

describe("checkSurcharges (AC-11)", () => {
  it("claims the whole energy surcharge on BW-5521 and the fuel excess on NL-88310", () => {
    const findings = checkSurcharges(
      [invoice("BW-5521"), invoice("NL-88310")],
      ctx,
    );
    expect(
      findings.map((f) => [
        f.findingKey,
        f.amountCents,
        f.title,
        f.calculation,
      ]),
    ).toEqual([
      [
        "surcharge:brightwater packaging:BW-5521:surcharge-energy",
        31110,
        "Energy surcharge not permitted",
        "$311.10 energy surcharge, none permitted = $311.10",
      ],
      [
        "surcharge:northline industrial supply:NL-88310:surcharge-fuel",
        11475,
        "Fuel surcharge above cap",
        "$306.00 − 2.5% × $7,650.00 = $114.75",
      ],
    ]);
    expect(
      findings[0].evidence.map((e) => [e.label, e.source.locator]),
    ).toEqual([
      ["Surcharge billed", "charge line 1"],
      ["Permitted surcharges", "Section 6.1"],
    ]);
  });

  it("allows a fuel surcharge exactly at the cap, and flags 1 cent above it", () => {
    // 2.5% of $15,220.00 = $380.50 (AC-3).
    expect(checkSurcharges([invoice("NL-88121")], ctx)).toEqual([]);
    const [over] = checkSurcharges(
      [withCharges("NL-88121", [fuel(1, 38051)])],
      ctx,
    );
    expect(over.amountCents).toBe(1);
  });

  it("combines charges of one type", () => {
    const [finding] = checkSurcharges(
      [withCharges("NL-88310", [fuel(1, 15000), fuel(2, 15600)])],
      ctx,
    );
    expect(finding.calculation).toBe(
      "($150.00 + $156.00) − 2.5% × $7,650.00 = $114.75",
    );
    expect(finding.evidence.map((e) => e.source.locator)).toEqual([
      "charge line 1",
      "charge line 2",
      "Subtotal",
      "Section 5.1",
    ]);
  });

  it("gives no finding for a surcharge type with no cap", () => {
    const uncapped = buildContext({
      ...sample,
      contracts: sample.contracts.map((c) => ({
        ...c,
        surcharges: c.surcharges.map((s) => ({ ...s, capBps: null })),
      })),
    });
    expect(checkSurcharges([invoice("NL-88310")], uncapped)).toEqual([]);
  });

  it("flags an other charge for review, with or without a contract", () => {
    const other: InvoiceChargeRecord = {
      lineNo: 2,
      kind: "other",
      surchargeType: null,
      label: "Handling fee",
      rateBps: null,
      amountCents: 2500,
    };
    const noContract = {
      ...withCharges("BW-5530", [other]),
      invoiceDate: "2025-01-01",
    };
    const findings = checkSurcharges([noContract], ctx);
    expect(
      findings.map((f) => [
        f.findingKey,
        f.action,
        f.amountCents,
        f.title,
        f.calculation,
      ]),
    ).toEqual([
      [
        "surcharge:brightwater packaging:BW-5530:charge-line-2",
        "review_only",
        0,
        "Unrecognized charge: Handling fee",
        "Review only, no amount claimed",
      ],
    ]);
    expect(findings[0].evidence[0].source.locator).toBe("charge line 2");
  });
});
