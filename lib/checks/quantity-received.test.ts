import { describe, expect, it } from "vitest";
import { briefSampleRecords } from "@/lib/schemas/fixtures/brief-sample-records";
import type { AuditInput, InvoiceRecord } from "@/lib/schemas/records";
import { buildContext } from "./context";
import { checkQuantityReceived } from "./quantity-received";

const sample = briefSampleRecords();
const invoice = (number: string): InvoiceRecord => {
  const found = sample.invoices.find((i) => i.invoiceNumber === number);
  if (!found) throw new Error(`no invoice ${number}`);
  return found;
};
const run = (invoices: readonly InvoiceRecord[], input: AuditInput = sample) =>
  checkQuantityReceived(invoices, buildContext(input));

/** NL-88203's V-belts only, `quantity` units, as its own invoice. */
const beltInvoice = (
  number: string,
  documentId: number,
  invoiceDate: string,
  quantity: number,
): InvoiceRecord => {
  const belt = invoice("NL-88203").lines[2];
  return {
    ...invoice("NL-88203"),
    documentId,
    invoiceNumber: number,
    invoiceDate,
    lines: [
      {
        ...belt,
        lineNo: 1,
        quantity,
        amountCents: quantity * belt.unitPriceCents,
      },
    ],
  };
};

describe("checkQuantityReceived (AC-10)", () => {
  it("flags the 40 V-belts on NL-88203 at the contract price", () => {
    // The duplicate NL88310 is removed by runChecks before this check sees it.
    const findings = run(
      sample.invoices.filter((i) => i.invoiceNumber !== "NL88310"),
    );
    expect(findings.map((f) => [f.findingKey, f.amountCents, f.title])).toEqual(
      [
        [
          "quantity_received:northline industrial supply:NL-88203:NL-BLT-A42",
          39000,
          "40 × V-belt A42 billed, not received",
        ],
      ],
    );
  });

  it("flags only the invoice that passes received across partial invoices", () => {
    const first = beltInvoice("NL-1", 30, "2026-02-20", 300);
    const second = beltInvoice("NL-2", 31, "2026-02-27", 100);
    const findings = run([second, first]);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      invoiceDocumentId: 31,
      amountCents: 40 * 975,
      calculation:
        "(100 billed + 300 billed earlier on PO-4502 − 360 received) × $9.75 = $390.00",
    });
    expect(
      findings[0].evidence.map((e) => [e.label, e.value, e.source.locator]),
    ).toEqual([
      ["Quantity billed", "100", "line 1"],
      ["Billed earlier on PO-4502", "300 on NL-1", "line 1"],
      ["Quantity received", "360", "row 5"],
      ["Price used", "$9.75", "Schedule A, item 5"],
    ]);
  });

  it("subtracts units already flagged on an earlier invoice", () => {
    const first = beltInvoice("NL-1", 30, "2026-02-20", 380);
    const second = beltInvoice("NL-2", 31, "2026-02-27", 50);
    const findings = run([first, second]);
    expect(findings.map((f) => [f.invoiceDocumentId, f.amountCents])).toEqual([
      [30, 20 * 975],
      [31, 50 * 975],
    ]);
    expect(findings[1].calculation).toBe(
      "(50 billed + 380 billed earlier on PO-4502 − 360 received − 20 already flagged) × $9.75 = $487.50",
    );
    expect(
      findings[1].evidence.find((e) => e.label.startsWith("Already over")),
    ).toMatchObject({
      value: "20",
      source: { documentId: 30, locator: "line 1" },
    });
  });

  it("counts a SKU with no receipt row as 0 received, priced at the lowest billed price with no contract price", () => {
    const base = invoice("NL-88203");
    const extra: InvoiceRecord = {
      ...base,
      lines: [
        {
          ...base.lines[0],
          lineNo: 1,
          sku: "NL-NEW-1",
          quantity: 10,
          unitPriceCents: 300,
          amountCents: 3000,
        },
        {
          ...base.lines[0],
          lineNo: 2,
          sku: "NL-NEW-1",
          quantity: 5,
          unitPriceCents: 250,
          amountCents: 1250,
        },
      ],
    };
    const [finding] = run([extra]);
    expect(finding).toMatchObject({
      amountCents: 15 * 250,
      calculation: "(15 billed − 0 received) × $2.50 = $37.50",
    });
    expect(finding.evidence.at(-1)).toMatchObject({
      label: "Price used",
      source: { filename: "NL-88203.pdf", locator: "line 2" },
    });
  });

  it("gives one review finding per invoice on a PO with no receipts at all", () => {
    const input = {
      ...sample,
      receipts: sample.receipts.filter((r) => r.poNumber !== "PO-4504"),
    };
    const findings = run(
      sample.invoices.filter((i) => i.poNumber === "PO-4504"),
      input,
    );
    expect(
      findings.map((f) => [
        f.findingKey.split(":")[2],
        f.action,
        f.amountCents,
        f.title,
      ]),
    ).toEqual([
      ["NL-88310", "review_only", 0, "No goods receipt found for PO-4504"],
      ["NL88310", "review_only", 0, "No goods receipt found for PO-4504"],
    ]);
  });

  it("skips invoices with no PO or an unknown PO", () => {
    const unknown = { ...invoice("NL-88203"), poNumber: "PO-9999" };
    expect(run([invoice("BW-5530"), unknown])).toEqual([]);
  });
});
