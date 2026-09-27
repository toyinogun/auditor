import { describe, expect, it } from "vitest";
import { briefSampleRecords } from "@/lib/schemas/fixtures/brief-sample-records";
import type { AuditInput, InvoiceRecord } from "@/lib/schemas/records";
import { buildContext } from "./context";
import { findDuplicates } from "./duplicate";

const sample = briefSampleRecords();
const run = (input: AuditInput) =>
  findDuplicates(input.invoices, buildContext(input));
const invoice = (number: string): InvoiceRecord => {
  const found = sample.invoices.find((i) => i.invoiceNumber === number);
  if (!found) throw new Error(`no invoice ${number}`);
  return found;
};

describe("findDuplicates (AC-4, AC-5)", () => {
  it("flags NL88310 as a paid twice copy of NL-88310", () => {
    const { findings, duplicateDocumentIds } = run(sample);
    expect(findings).toHaveLength(1);
    const [finding] = findings;
    expect(finding).toMatchObject({
      findingKey: "duplicate:northline industrial supply:NL88310:-",
      checkId: "duplicate",
      action: "recover",
      invoiceDocumentId: invoice("NL88310").documentId,
      amountCents: 814100,
      title: "Duplicate of NL-88310, paid twice",
      calculation:
        "Invoice total $8,141.00, paid twice (ap_payments.csv rows 4, 5) = $8,141.00",
    });
    expect(duplicateDocumentIds).toEqual(
      new Set([invoice("NL88310").documentId]),
    );
    expect(finding.evidence.map((e) => [e.label, e.source.locator])).toEqual([
      ["Invoice number", "Invoice number"],
      ["Invoice total", "Invoice total"],
      ["Original invoice", "Invoice number"],
      ["Matched on", "Invoice number"],
      ["Payment", "row 4"],
      ["Payment", "row 5"],
    ]);
  });

  it("blocks the copy when only the original was paid", () => {
    const { findings } = run({
      ...sample,
      payments: sample.payments.filter((p) => p.invoiceNumber !== "NL88310"),
    });
    expect(findings[0]).toMatchObject({
      action: "block_payment",
      amountCents: 814100,
      title: "Duplicate of NL-88310, unpaid",
      calculation: "Invoice total $8,141.00, not yet paid = $8,141.00 to block",
    });
  });

  it("blocks a third copy when the group has only 2 payments", () => {
    const third: InvoiceRecord = {
      ...invoice("NL88310"),
      documentId: 40,
      filename: "NL 88310 again.pdf",
      invoiceNumber: "NL 88310",
      invoiceDate: "2026-06-01",
    };
    const { findings } = run({
      ...sample,
      invoices: [...sample.invoices, third],
    });
    expect(findings.map((f) => [f.invoiceDocumentId, f.action])).toEqual([
      [invoice("NL88310").documentId, "recover"],
      [40, "block_payment"],
    ]);
  });

  it("matches on PO and total when the numbers differ", () => {
    const retyped: InvoiceRecord = {
      ...invoice("NL88310"),
      invoiceNumber: "NL-99999",
    };
    const { findings } = run({
      ...sample,
      invoices: sample.invoices.map((i) =>
        i.invoiceNumber === "NL88310" ? retyped : i,
      ),
      payments: sample.payments.filter((p) => p.invoiceNumber !== "NL88310"),
    });
    expect(findings).toHaveLength(1);
    expect(findings[0].evidence[3]).toMatchObject({
      label: "Matched on",
      value: "PO and total",
    });
  });

  it("orders a same day group by document, and ignores other suppliers", () => {
    const earlierCopy: InvoiceRecord = {
      ...invoice("NL88310"),
      invoiceDate: "2026-04-03",
      documentId: 2,
    };
    const otherSupplier: InvoiceRecord = {
      ...invoice("NL-88203"),
      documentId: 41,
      supplierKey: "someone else",
    };
    const { findings } = run({
      ...sample,
      invoices: [
        ...sample.invoices.filter((i) => i.invoiceNumber !== "NL88310"),
        earlierCopy,
        otherSupplier,
      ],
    });
    expect(findings).toHaveLength(1);
    expect(findings[0].invoiceDocumentId).toBe(invoice("NL-88310").documentId);
    expect(findings[0].title).toBe("Duplicate of NL88310, paid twice");
  });

  it("finds nothing with no invoices", () => {
    expect(run({ ...sample, invoices: [] }).findings).toEqual([]);
  });
});
