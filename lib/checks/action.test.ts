import { describe, expect, it } from "vitest";
import { Finding } from "@/lib/schemas/finding";
import { briefSampleRecords } from "@/lib/schemas/fixtures/brief-sample-records";
import type { InvoiceRecord } from "@/lib/schemas/records";
import { actionFor, isPaid, moneyFinding, reviewFinding } from "./action";
import { buildContext } from "./context";
import { evidenceItem, INVOICE_LABEL } from "./evidence";

const input = briefSampleRecords();
const ctx = buildContext(input);
const invoice = (number: string): InvoiceRecord => {
  const found = input.invoices.find((i) => i.invoiceNumber === number);
  if (!found) throw new Error(`no invoice ${number}`);
  return found;
};

describe("isPaid (AC-6)", () => {
  it("counts only ledger rows matching the invoice's own number", () => {
    expect(isPaid(invoice("NL-88203"), ctx)).toBe(true);
    expect(isPaid(invoice("BW-5530"), ctx)).toBe(false);
  });

  it("does not count a payment of another supplier with the same number", () => {
    const moved = buildContext({
      ...input,
      payments: input.payments.map((p) =>
        p.invoiceNumber === "NL-88203"
          ? { ...p, supplierKey: "brightwater packaging" }
          : p,
      ),
    });
    expect(isPaid(invoice("NL-88203"), moved)).toBe(false);
  });
});

describe("actionFor (AC-6)", () => {
  it("recovers when paid, blocks when unpaid, and reviews at $0", () => {
    expect(actionFor(invoice("NL-88203"), ctx, 100)).toBe("recover");
    expect(actionFor(invoice("BW-5530"), ctx, 100)).toBe("block_payment");
    expect(actionFor(invoice("NL-88203"), ctx, 0)).toBe("review_only");
  });
});

describe("finding builders", () => {
  const bw5530 = invoice("BW-5530");
  const evidence = [
    evidenceItem("PO number", "none", bw5530, INVOICE_LABEL.po),
  ];

  it("builds a review only finding keyed by its detail", () => {
    const finding = reviewFinding(bw5530, {
      check: "missing_reference",
      detail: "po",
      title: "No PO",
      evidence,
    });
    expect(Finding.parse(finding)).toEqual(finding);
    expect(finding).toMatchObject({
      findingKey: "missing_reference:brightwater packaging:BW-5530:po",
      action: "review_only",
      amountCents: 0,
      calculation: "Review only, no amount claimed",
      invoiceDocumentId: bw5530.documentId,
    });
    expect(finding.evidence[0].source).toEqual({
      documentId: bw5530.documentId,
      filename: "BW-5530.pdf",
      locator: "PO number",
    });
  });

  it("sets a money finding's action from payment status", () => {
    const finding = moneyFinding(bw5530, ctx, {
      check: "contract_price",
      detail: "BW-TAPE-48",
      amountCents: 500,
      title: "t",
      calculation: "c",
      evidence,
    });
    expect(finding.action).toBe("block_payment");
  });
});
