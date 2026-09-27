import { describe, expect, it } from "vitest";
import { briefSampleRecords } from "@/lib/schemas/fixtures/brief-sample-records";
import type { InvoiceRecord } from "@/lib/schemas/records";
import { buildContext } from "./context";
import { checkContractPrice } from "./contract-price";

const sample = briefSampleRecords();
const ctx = buildContext(sample);
const invoice = (number: string): InvoiceRecord => {
  const found = sample.invoices.find((i) => i.invoiceNumber === number);
  if (!found) throw new Error(`no invoice ${number}`);
  return found;
};

describe("checkContractPrice (AC-13)", () => {
  it("flags the gasket on NL-88203 and nothing on NL-88121", () => {
    const findings = checkContractPrice(
      [invoice("NL-88121"), invoice("NL-88203")],
      ctx,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      findingKey:
        "contract_price:northline industrial supply:NL-88203:NL-GSK-0850",
      amountCents: 25000,
      title: "Flange gasket 85 mm billed above contract price",
      calculation: "($0.97 − $0.92) × 5,000 = $250.00",
    });
    expect(
      findings[0].evidence.map((e) => [e.label, e.value, e.source.locator]),
    ).toEqual([
      ["Billed unit price", "$0.97", "line 1"],
      ["Quantity billed", "5,000", "line 1"],
      ["Contract price", "$0.92", "Schedule A, item 3"],
    ]);
  });

  it("joins two lines of one SKU into one finding, and a cheaper line never offsets", () => {
    const base = invoice("NL-88310");
    const [bearing] = base.lines;
    const twoLines: InvoiceRecord = {
      ...base,
      lines: [
        bearing,
        { ...bearing, lineNo: 2, unitPriceCents: 500, amountCents: 750000 },
        {
          ...bearing,
          lineNo: 3,
          unitPriceCents: 480,
          amountCents: 48000,
          quantity: 100,
        },
      ],
    };
    const [finding, ...rest] = checkContractPrice([twoLines], ctx);
    expect(rest).toEqual([]);
    expect(finding.amountCents).toBe(37500 + 22500);
    expect(finding.calculation).toBe(
      "($5.10 − $4.85) × 1,500 + ($5.00 − $4.85) × 1,500 = $600.00",
    );
  });

  it("skips an invoice with no contract in force, and a SKU with no price", () => {
    const early: InvoiceRecord = {
      ...invoice("NL-88203"),
      invoiceDate: "2025-12-15",
    };
    const unpriced: InvoiceRecord = {
      ...invoice("NL-88203"),
      lines: invoice("NL-88203").lines.map((line) => ({
        ...line,
        sku: "NL-NEW-1",
      })),
    };
    expect(checkContractPrice([early, unpriced], ctx)).toEqual([]);
  });
});
