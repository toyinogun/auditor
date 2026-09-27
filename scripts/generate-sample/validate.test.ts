import { describe, expect, it } from "vitest";
import { BRIEF_SAMPLE } from "../../lib/schemas/fixtures/brief-sample";
import { validateSample } from "./validate";

describe("validateSample", () => {
  it("accepts the brief's sample as it is", () => {
    expect(validateSample(BRIEF_SAMPLE)).toEqual({
      ok: true,
      value: undefined,
    });
  });

  it("names the file and line when an invoice line does not add up (AC-2)", () => {
    const invoices = BRIEF_SAMPLE.invoices.map((doc) =>
      doc.filename === "NL-88310.pdf"
        ? {
            ...doc,
            extraction: {
              ...doc.extraction,
              lines: [{ ...doc.extraction.lines[0], unitPrice: "5.01" }],
            },
          }
        : doc,
    );
    const result = validateSample({ ...BRIEF_SAMPLE, invoices });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("NL-88310.pdf");
      expect(result.error).toContain("line 1");
    }
  });

  it("names the contract when a contract price is malformed", () => {
    const [first, ...rest] = BRIEF_SAMPLE.contracts;
    const broken = {
      ...first,
      extraction: {
        ...first.extraction,
        prices: [{ ...first.extraction.prices[0], unitPrice: "4,85" }],
      },
    };
    const result = validateSample({
      ...BRIEF_SAMPLE,
      contracts: [broken, ...rest],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("C-2026-014.pdf");
  });

  it("names the purchase order when a quantity is not whole", () => {
    const [first, ...rest] = BRIEF_SAMPLE.purchaseOrders;
    const broken = {
      ...first,
      extraction: {
        ...first.extraction,
        lines: [{ ...first.extraction.lines[0], quantity: 1.5 }],
      },
    };
    const result = validateSample({
      ...BRIEF_SAMPLE,
      purchaseOrders: [broken, ...rest],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("PO-4501.pdf");
      expect(result.error).toContain("line 1");
    }
  });

  it("names the CSV file and row when a receipt row is invalid", () => {
    const rows = BRIEF_SAMPLE.receipts.rows.map((row, i) =>
      i === 2 ? { ...row, quantity_received: "-5" } : row,
    );
    const result = validateSample({
      ...BRIEF_SAMPLE,
      receipts: { ...BRIEF_SAMPLE.receipts, rows },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("receipts.csv");
      expect(result.error).toContain("row 3");
    }
  });

  it("names the CSV file and row when a payment row is invalid", () => {
    const rows = BRIEF_SAMPLE.payments.rows.map((row, i) =>
      i === 4 ? { ...row, amount: "8,141.00" } : row,
    );
    const result = validateSample({
      ...BRIEF_SAMPLE,
      payments: { ...BRIEF_SAMPLE.payments, rows },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("ap_payments.csv");
      expect(result.error).toContain("row 5");
    }
  });
});
