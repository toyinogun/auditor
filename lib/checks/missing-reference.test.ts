import { describe, expect, it } from "vitest";
import { briefSampleRecords } from "@/lib/schemas/fixtures/brief-sample-records";
import type { InvoiceRecord } from "@/lib/schemas/records";
import { buildContext } from "./context";
import { runChecks } from "./index";
import { checkMissingReferences } from "./missing-reference";

const sample = briefSampleRecords();
const ctx = buildContext(sample);
const invoice = (number: string): InvoiceRecord => {
  const found = sample.invoices.find((i) => i.invoiceNumber === number);
  if (!found) throw new Error(`no invoice ${number}`);
  return found;
};
const summary = (invoices: readonly InvoiceRecord[]) =>
  checkMissingReferences(invoices, ctx).map((f) => [
    f.findingKey.split(":").slice(2).join(":"),
    f.action,
    f.amountCents,
    f.title,
  ]);

describe("checkMissingReferences (AC-9)", () => {
  it("flags BW-5530 for having no PO", () => {
    expect(summary([invoice("BW-5530")])).toEqual([
      ["BW-5530:po", "review_only", 0, "No PO"],
    ]);
  });

  it("flags a PO that matches no purchase order", () => {
    const unknown = {
      ...invoice("NL-88203"),
      invoiceNumber: "NL-1",
      poNumber: "PO-9999",
    };
    expect(summary([unknown])).toEqual([
      ["NL-1:po", "review_only", 0, "PO PO-9999 not found"],
    ]);
  });

  it("flags an invoice dated before any contract", () => {
    const early = {
      ...invoice("NL-88203"),
      invoiceNumber: "NL-2",
      invoiceDate: "2025-12-15",
    };
    expect(summary([early])).toEqual([
      ["NL-2:contract", "review_only", 0, "No contract in force on 2025-12-15"],
    ]);
  });

  it("flags a SKU the contract does not price once, however many lines bill it", () => {
    const base = invoice("NL-88203");
    const unpriced: InvoiceRecord = {
      ...base,
      lines: [
        ...base.lines,
        { ...base.lines[0], lineNo: 4, sku: "NL-NEW-1" },
        { ...base.lines[0], lineNo: 5, sku: "NL-NEW-1" },
      ],
    };
    const findings = checkMissingReferences([unpriced], ctx);
    expect(summary([unpriced])).toEqual([
      ["NL-88203:NL-NEW-1", "review_only", 0, "No contract price for NL-NEW-1"],
    ]);
    expect(findings[0].evidence.map((e) => e.source.locator)).toEqual([
      "line 4",
      "line 5",
    ]);
  });

  it("lets price, surcharge and freight skip a no contract invoice", () => {
    const early: InvoiceRecord = {
      ...invoice("NL-88310"),
      invoiceDate: "2025-12-15",
      charges: [
        ...invoice("NL-88310").charges,
        {
          lineNo: 3,
          kind: "other",
          surchargeType: null,
          label: "Handling",
          rateBps: null,
          amountCents: 0,
        },
      ],
    };
    const findings = runChecks({
      ...sample,
      invoices: sample.invoices.map((i) =>
        i.invoiceNumber === "NL-88310" ? early : i,
      ),
    }).filter((f) => f.invoiceDocumentId === early.documentId);
    expect(findings.map((f) => f.findingKey.split(":")[3])).toEqual([
      "contract",
      "charge-line-3",
    ]);
  });
});
