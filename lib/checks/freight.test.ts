import { describe, expect, it } from "vitest";
import { briefSampleRecords } from "@/lib/schemas/fixtures/brief-sample-records";
import type { InvoiceRecord } from "@/lib/schemas/records";
import { buildContext } from "./context";
import { checkFreight } from "./freight";

const sample = briefSampleRecords();
const ctx = buildContext(sample);
const invoice = (number: string): InvoiceRecord => {
  const found = sample.invoices.find((i) => i.invoiceNumber === number);
  if (!found) throw new Error(`no invoice ${number}`);
  return found;
};
const freightOn = (number: string): InvoiceRecord => ({
  ...invoice(number),
  charges: [
    {
      lineNo: 1,
      kind: "freight",
      surchargeType: null,
      label: "Freight",
      rateBps: null,
      amountCents: 4000,
    },
  ],
});

describe("checkFreight (AC-12)", () => {
  it("recovers freight on NL-88310, where the contract includes it", () => {
    const originals = sample.invoices.filter(
      (i) => i.invoiceNumber !== "NL88310",
    );
    const [finding, ...rest] = checkFreight(originals, ctx);
    expect(rest).toEqual([]);
    expect(finding).toMatchObject({
      findingKey: "freight:northline industrial supply:NL-88310:freight",
      amountCents: 18500,
      title: "Freight billed, contract includes it",
      calculation: "$185.00 freight, included in contract price = $185.00",
    });
    expect(
      finding.evidence.map((e) => [
        e.label,
        e.source.filename,
        e.source.locator,
      ]),
    ).toEqual([
      ["Freight billed", "NL-88310.pdf", "charge line 2"],
      ["Freight terms", "C-2026-014.pdf", "Section 4.2"],
    ]);
  });

  it("gives no finding when the contract does not state freight", () => {
    expect(checkFreight([freightOn("BW-5521")], ctx)).toEqual([]);
  });

  it("gives no finding when freight is billable", () => {
    const billable = buildContext({
      ...sample,
      contracts: sample.contracts.map((c) => ({
        ...c,
        freightTerms: "billable" as const,
      })),
    });
    expect(checkFreight([invoice("NL-88310")], billable)).toEqual([]);
  });
});
