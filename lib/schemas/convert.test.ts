import { describe, expect, it } from "vitest";
import {
  toContractRecord,
  toInvoiceRecord,
  toPaymentRecord,
  toPurchaseOrderRecord,
  toReceiptRecord,
} from "./convert";
import type { InvoiceExtraction } from "./extraction";
import {
  BRIEF_INVOICED_TOTAL_CENTS,
  BRIEF_SAMPLE,
} from "./fixtures/brief-sample";
import { AuditInput } from "./records";
import type { Result } from "./result";

const ref = { documentId: 1, filename: "sample.pdf" };

const valueOf = <T>(result: Result<T>): T => {
  if (!result.ok) throw new Error(result.error);
  return result.value;
};

const errorOf = <T>(result: Result<T>): string => {
  if (result.ok) throw new Error("expected a failure");
  return result.error;
};

const invoice = (filename: string): InvoiceExtraction => {
  const found = BRIEF_SAMPLE.invoices.find((doc) => doc.filename === filename);
  if (!found) throw new Error(`no sample invoice ${filename}`);
  return found.extraction;
};

const convertSample = () => {
  let documentId = 0;
  const next = (filename: string) => ({ documentId: ++documentId, filename });
  return {
    contracts: BRIEF_SAMPLE.contracts.map((d) =>
      valueOf(toContractRecord(d.extraction, next(d.filename))),
    ),
    purchaseOrders: BRIEF_SAMPLE.purchaseOrders.map((d) =>
      valueOf(toPurchaseOrderRecord(d.extraction, next(d.filename))),
    ),
    invoices: BRIEF_SAMPLE.invoices.map((d) =>
      valueOf(toInvoiceRecord(d.extraction, next(d.filename))),
    ),
    receipts: ((doc) =>
      BRIEF_SAMPLE.receipts.rows.map((row, i) =>
        valueOf(toReceiptRecord(row, doc, i + 1)),
      ))(next(BRIEF_SAMPLE.receipts.filename)),
    payments: ((doc) =>
      BRIEF_SAMPLE.payments.rows.map((row, i) =>
        valueOf(toPaymentRecord(row, doc, i + 1)),
      ))(next(BRIEF_SAMPLE.payments.filename)),
  };
};

describe("the brief sample", () => {
  it("converts every document and row with no special cases", () => {
    const input = convertSample();
    expect(input.contracts).toHaveLength(2);
    expect(input.purchaseOrders).toHaveLength(4);
    expect(input.invoices).toHaveLength(6);
    expect(input.receipts).toHaveLength(8);
    expect(input.payments).toHaveLength(5);
    expect(AuditInput.safeParse(input).success).toBe(true);
  });

  it("invoices $53,939.60 in total, the duplicate included", () => {
    const total = convertSample().invoices.reduce(
      (sum, inv) => sum + inv.totalCents,
      0,
    );
    expect(total).toBe(BRIEF_INVOICED_TOTAL_CENTS);
  });

  it("reads NL-88310 in cents with its locators", () => {
    const record = valueOf(
      toInvoiceRecord(invoice("NL-88310.pdf"), {
        documentId: 9,
        filename: "NL-88310.pdf",
      }),
    );
    expect(record).toEqual({
      documentId: 9,
      filename: "NL-88310.pdf",
      supplierKey: "northline industrial supply",
      supplierName: "Northline Industrial Supply",
      invoiceNumber: "NL-88310",
      invoiceDate: "2026-04-03",
      poNumber: "PO-4504",
      currency: "USD",
      subtotalCents: 765000,
      totalCents: 814100,
      lines: [
        {
          lineNo: 1,
          sku: "NL-BRG-6204",
          description: "Deep groove ball bearing 6204",
          quantity: 1500,
          unitPriceCents: 510,
          amountCents: 765000,
        },
      ],
      charges: [
        {
          lineNo: 1,
          kind: "surcharge",
          surchargeType: "fuel",
          label: "Fuel surcharge 4.0%",
          rateBps: 400,
          amountCents: 30600,
        },
        {
          lineNo: 2,
          kind: "freight",
          surchargeType: null,
          label: "Freight",
          rateBps: null,
          amountCents: 18500,
        },
      ],
    });
  });

  it("reads the Northline ledger name and the Brightwater contract to their supplier keys", () => {
    const input = convertSample();
    expect(new Set(input.payments.map((p) => p.supplierKey))).toEqual(
      new Set(["northline industrial supply", "brightwater packaging"]),
    );
    expect(input.contracts.map((c) => c.supplierKey)).toEqual([
      "northline industrial supply",
      "brightwater packaging",
    ]);
  });

  it("carries contract clauses and caps", () => {
    const [northline, brightwater] = convertSample().contracts;
    expect(northline.prices[0]).toEqual({
      sku: "NL-BRG-6204",
      description: "Deep groove ball bearing 6204",
      unitPriceCents: 485,
      clause: "Schedule A, item 1",
    });
    expect(northline.surcharges).toEqual([
      { surchargeType: "fuel", capBps: 250, clause: "Section 5.1" },
    ]);
    expect(northline.freightTerms).toBe("included");
    expect(brightwater.surcharges).toEqual([]);
  });
});

describe("toInvoiceRecord arithmetic guard", () => {
  const base = invoice("NL-88310.pdf");

  it("fails naming line 1 when quantity × unit price ≠ the printed amount", () => {
    const broken = {
      ...base,
      lines: [{ ...base.lines[0], unitPrice: "5.01" }],
    };
    expect(errorOf(toInvoiceRecord(broken, ref))).toContain("line 1");
  });

  it("fails naming the subtotal when the lines do not add up", () => {
    expect(
      errorOf(toInvoiceRecord({ ...base, subtotal: "7600.00" }, ref)),
    ).toContain("subtotal");
  });

  it("fails naming the charge when its amount ≠ its rate of the subtotal", () => {
    const broken = {
      ...base,
      charges: [{ ...base.charges[0], amount: "306.01" }, base.charges[1]],
    };
    expect(errorOf(toInvoiceRecord(broken, ref))).toContain("charge 1");
  });

  it("fails naming the total when it ≠ subtotal + charges", () => {
    expect(
      errorOf(toInvoiceRecord({ ...base, total: "8140.00" }, ref)),
    ).toContain("total");
  });

  it("fails when a surcharge has no surcharge type, or another charge has one", () => {
    const noType = {
      ...base,
      charges: [{ ...base.charges[0], surchargeType: null }, base.charges[1]],
    };
    expect(errorOf(toInvoiceRecord(noType, ref))).toContain("charge 1");
    const extraType = {
      ...base,
      charges: [base.charges[0], { ...base.charges[1], surchargeType: "fuel" }],
    };
    expect(errorOf(toInvoiceRecord(extraType, ref))).toContain("charge 2");
  });

  it("fails naming the field for a malformed amount", () => {
    const broken = {
      ...base,
      lines: [{ ...base.lines[0], amount: "7,650.00" }],
    };
    expect(errorOf(toInvoiceRecord(broken, ref))).toContain("line 1 amount");
  });

  it("fails on a shape error with the path", () => {
    expect(errorOf(toInvoiceRecord({ ...base, lines: [] }, ref))).toContain(
      "lines",
    );
    expect(
      errorOf(toInvoiceRecord({ ...base, invoiceDate: "2026-02-30" }, ref)),
    ).toContain("invoiceDate");
  });
});

describe("quantities", () => {
  const base = invoice("BW-5530.pdf");

  it.each([1.5, 0, -200])("rejects quantity %d naming the line", (quantity) => {
    const broken = { ...base, lines: [{ ...base.lines[0], quantity }] };
    expect(errorOf(toInvoiceRecord(broken, ref))).toContain("line 1");
  });

  it("rejects a bad PO line quantity naming the line", () => {
    const po = BRIEF_SAMPLE.purchaseOrders[0].extraction;
    const broken = {
      ...po,
      lines: [po.lines[0], { ...po.lines[1], quantity: 2.5 }],
    };
    expect(errorOf(toPurchaseOrderRecord(broken, ref))).toContain("line 2");
  });

  it.each(["0", "1.5", "-3", "1,000", ""])(
    "rejects received quantity %j naming the row",
    (quantity_received) => {
      const row = { ...BRIEF_SAMPLE.receipts.rows[0], quantity_received };
      expect(errorOf(toReceiptRecord(row, ref, 4))).toContain("row 4");
    },
  );
});

describe("currency", () => {
  it("rejects a non USD invoice, contract and purchase order", () => {
    expect(
      errorOf(
        toInvoiceRecord({ ...invoice("BW-5530.pdf"), currency: "EUR" }, ref),
      ),
    ).toContain("EUR");
    const contract = BRIEF_SAMPLE.contracts[0].extraction;
    expect(
      errorOf(toContractRecord({ ...contract, currency: "CAD" }, ref)),
    ).toContain("CAD");
    const po = BRIEF_SAMPLE.purchaseOrders[0].extraction;
    expect(
      errorOf(toPurchaseOrderRecord({ ...po, currency: "usd dollars" }, ref)),
    ).toContain("currency");
  });

  it("accepts lower case usd", () => {
    expect(
      toInvoiceRecord({ ...invoice("BW-5530.pdf"), currency: "usd" }, ref).ok,
    ).toBe(true);
  });
});

describe("toContractRecord", () => {
  const base = BRIEF_SAMPLE.contracts[0].extraction;

  it("rejects a term that ends before it starts", () => {
    expect(
      errorOf(toContractRecord({ ...base, endDate: "2025-12-31" }, ref)),
    ).toContain("endDate");
  });

  it("rejects a SKU priced twice", () => {
    const broken = { ...base, prices: [...base.prices, base.prices[0]] };
    expect(errorOf(toContractRecord(broken, ref))).toContain("NL-BRG-6204");
  });

  it("rejects a malformed cap naming the surcharge", () => {
    const broken = {
      ...base,
      surcharges: [{ ...base.surcharges[0], capRate: "2.5%" }],
    };
    expect(errorOf(toContractRecord(broken, ref))).toContain("surcharge 1");
  });
});

describe("CSV rows", () => {
  it("reads a payment with a blank reference as null", () => {
    const row = { ...BRIEF_SAMPLE.payments.rows[0], reference: " " };
    expect(valueOf(toPaymentRecord(row, ref, 1))).toMatchObject({
      rowNo: 1,
      invoiceNumber: "NL-88121",
      amountCents: 1560050,
      reference: null,
      supplierKey: "northline industrial supply",
      supplierName: "Northline Industrial Supply Inc.",
    });
  });

  it("rejects a malformed payment amount naming the row", () => {
    const row = { ...BRIEF_SAMPLE.payments.rows[0], amount: "$15,600.50" };
    expect(errorOf(toPaymentRecord(row, ref, 2))).toContain("row 2");
  });

  it("rejects a receipt with a bad date naming the row", () => {
    const row = {
      ...BRIEF_SAMPLE.receipts.rows[0],
      received_date: "26/01/2026",
    };
    expect(errorOf(toReceiptRecord(row, ref, 3))).toContain("row 3");
  });
});
