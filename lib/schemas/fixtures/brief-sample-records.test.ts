import { describe, expect, it } from "vitest";
import { AuditInput } from "../records";
import { BRIEF_INVOICED_TOTAL_CENTS } from "./brief-sample";
import { briefSampleRecords } from "./brief-sample-records";

describe("briefSampleRecords", () => {
  it("converts every sample document into a valid audit input", () => {
    const input = briefSampleRecords();
    expect(AuditInput.parse(input)).toEqual(input);
    expect(input.invoices).toHaveLength(6);
    expect(input.contracts).toHaveLength(2);
    expect(input.purchaseOrders).toHaveLength(4);
    expect(input.receipts).toHaveLength(8);
    expect(input.payments).toHaveLength(5);
  });

  it("totals the brief's invoiced amount", () => {
    const total = briefSampleRecords().invoices.reduce(
      (sum, invoice) => sum + invoice.totalCents,
      0,
    );
    expect(total).toBe(BRIEF_INVOICED_TOTAL_CENTS);
  });

  it("numbers documents 1 to 14 in fixture order by default", () => {
    const input = briefSampleRecords();
    expect(input.contracts.map((c) => c.documentId)).toEqual([1, 2]);
    expect(input.purchaseOrders.map((po) => po.documentId)).toEqual([
      3, 4, 5, 6,
    ]);
    expect(input.invoices.map((i) => i.documentId)).toEqual([
      7, 8, 9, 10, 11, 12,
    ]);
    expect(new Set(input.receipts.map((r) => r.documentId))).toEqual(
      new Set([13]),
    );
    expect(input.payments.map((p) => [p.documentId, p.rowNo])).toEqual([
      [14, 1],
      [14, 2],
      [14, 3],
      [14, 4],
      [14, 5],
    ]);
  });

  it("uses the document refs a caller supplies", () => {
    const input = briefSampleRecords((filename) => ({
      documentId: filename === "BW-5530.pdf" ? 99 : 1,
      filename,
    }));
    const bw5530 = input.invoices.find((i) => i.invoiceNumber === "BW-5530");
    expect(bw5530?.documentId).toBe(99);
  });
});
