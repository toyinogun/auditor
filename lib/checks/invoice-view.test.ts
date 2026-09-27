import { describe, expect, it } from "vitest";
import type { Finding } from "@/lib/schemas/finding";
import { briefSampleRecords } from "@/lib/schemas/fixtures/brief-sample-records";
import type { InvoiceRecord } from "@/lib/schemas/records";
import {
  EVIDENCE_LABEL,
  chargeLocator,
  evidenceItem,
  INVOICE_LABEL,
  lineLocator,
} from "./evidence";
import { runChecks } from "./index";
import {
  citationsFor,
  describeInvoiceLines,
  highlightsFor,
  type Highlights,
} from "./invoice-view";

const sample = briefSampleRecords();
const findings = runChecks(sample);

const invoiceNumbered = (number: string): InvoiceRecord => {
  const found = sample.invoices.find((i) => i.invoiceNumber === number);
  if (!found) throw new Error(`no invoice ${number}`);
  return found;
};

const findingEndingWith = (suffix: string): Finding => {
  const found = findings.find((f) => f.findingKey.endsWith(suffix));
  if (!found) throw new Error(`no finding ${suffix}`);
  return found;
};

const lineNoOf = (invoice: InvoiceRecord, sku: string): number => {
  const line = invoice.lines.find((l) => l.sku === sku);
  if (!line) throw new Error(`no ${sku} on ${invoice.invoiceNumber}`);
  return line.lineNo;
};

const isEmpty = (highlights: Highlights): boolean =>
  highlights.lines.size === 0 &&
  highlights.charges.size === 0 &&
  highlights.header.size === 0;

/** A finding on NL-88310 carrying only the given evidence, for label by label cases. */
const syntheticFinding = (
  evidence: Finding["evidence"],
  invoice: InvoiceRecord = invoiceNumbered("NL-88310"),
): Finding => ({
  findingKey: "synthetic",
  checkId: "missing_reference",
  action: "review_only",
  invoiceDocumentId: invoice.documentId,
  amountCents: 0,
  title: "Synthetic",
  calculation: "Review only, no amount claimed",
  evidence,
});

describe("describeInvoiceLines (spec 0008, AC-4)", () => {
  it("returns null for a document that is not an invoice in the input", () => {
    expect(describeInvoiceLines(sample, 99_999)).toBeNull();
  });

  it("adds the contract price and received quantity the checks used", () => {
    const invoice = invoiceNumbered("NL-88203");
    const view = describeInvoiceLines(sample, invoice.documentId);
    expect(view?.invoice).toBe(invoice);
    const belt = view?.lines.find((line) => line.sku === "NL-BLT-A42");
    expect(belt).toMatchObject({
      quantity: 400,
      receivedQuantity: 360,
      contractPriceCents: 975,
    });
    const gasket = view?.lines.find((line) => line.sku === "NL-GSK-0850");
    expect(gasket?.contractPriceCents).toBe(92);
    expect(view?.lines.map((line) => line.lineNo)).toEqual(
      invoice.lines.map((line) => line.lineNo),
    );
  });

  it("gives the bearing its contract price of $4.85", () => {
    const invoice = invoiceNumbered("NL-88310");
    const view = describeInvoiceLines(sample, invoice.documentId);
    expect(
      view?.lines.find((line) => line.sku === "NL-BRG-6204")
        ?.contractPriceCents,
    ).toBe(485);
  });

  it("has no received quantity for an invoice without a PO", () => {
    const invoice = invoiceNumbered("BW-5530");
    const view = describeInvoiceLines(sample, invoice.documentId);
    expect(view?.lines.length).toBeGreaterThan(0);
    view?.lines.forEach((line) => expect(line.receivedQuantity).toBeNull());
  });

  it("reads 0 received when the PO has receipts but none for the SKU", () => {
    const invoice = invoiceNumbered("NL-88203");
    const input = {
      ...sample,
      invoices: sample.invoices.map((i) =>
        i === invoice
          ? {
              ...i,
              lines: [...i.lines, { ...i.lines[0], lineNo: 99, sku: "NEW" }],
            }
          : i,
      ),
    };
    const view = describeInvoiceLines(input, invoice.documentId);
    expect(view?.lines.find((line) => line.lineNo === 99)).toMatchObject({
      receivedQuantity: 0,
      contractPriceCents: null,
    });
  });

  it("has no contract price when no contract is in force", () => {
    const invoice = invoiceNumbered("NL-88203");
    const view = describeInvoiceLines(
      { ...sample, contracts: [] },
      invoice.documentId,
    );
    view?.lines.forEach((line) => expect(line.contractPriceCents).toBeNull());
  });
});

describe("highlightsFor (spec 0008, AC-5)", () => {
  it("highlights something on every one of the 8 sample findings", () => {
    expect(findings).toHaveLength(8);
    findings.forEach((finding) =>
      expect(isEmpty(highlightsFor(finding))).toBe(false),
    );
  });

  it("marks the duplicate's invoice number and total, and no line", () => {
    const highlights = highlightsFor(findingEndingWith("NL88310:-"));
    expect([...highlights.header].sort()).toEqual(["invoiceNumber", "total"]);
    expect(highlights.lines.size).toBe(0);
    expect(highlights.charges.size).toBe(0);
  });

  it.each([
    ["NL-88310", "NL-BRG-6204"],
    ["NL-88203", "NL-GSK-0850"],
  ])("marks the billed unit price on %s's %s line", (number, sku) => {
    const highlights = highlightsFor(findingEndingWith(`${number}:${sku}`));
    const lineNo = lineNoOf(invoiceNumbered(number), sku);
    expect([...highlights.lines.keys()]).toEqual([lineNo]);
    expect(highlights.lines.get(lineNo)?.has("unitPrice")).toBe(true);
    expect(highlights.header.size).toBe(0);
  });

  it("marks quantity billed on the V-belt line, not the received quantity", () => {
    const highlights = highlightsFor(findingEndingWith("NL-88203:NL-BLT-A42"));
    const lineNo = lineNoOf(invoiceNumbered("NL-88203"), "NL-BLT-A42");
    expect([...highlights.lines.keys()]).toEqual([lineNo]);
    expect([...(highlights.lines.get(lineNo) ?? [])]).toEqual(["quantity"]);
  });

  it.each([
    "BW-5521:surcharge-energy",
    "NL-88310:surcharge-fuel",
    "NL-88310:freight",
  ])("marks a charge amount on %s", (suffix) => {
    const highlights = highlightsFor(findingEndingWith(suffix));
    expect(highlights.charges.size).toBeGreaterThan(0);
    expect(highlights.lines.size).toBe(0);
    // Subtotal is proof, not the error.
    expect(highlights.header.size).toBe(0);
  });

  it("marks the PO field on BW-5530", () => {
    const highlights = highlightsFor(findingEndingWith("BW-5530:po"));
    expect([...highlights.header]).toEqual(["poNumber"]);
  });

  it("flags the line without marking a figure for a SKU with no contract price", () => {
    const invoice = invoiceNumbered("NL-88310");
    const highlights = highlightsFor(
      syntheticFinding([
        evidenceItem(EVIDENCE_LABEL.billedSku, "X", invoice, lineLocator(2)),
      ]),
    );
    expect(highlights.lines.get(2)?.size).toBe(0);
  });

  it("marks the invoice date when no contract is in force", () => {
    const invoice = invoiceNumbered("NL-88310");
    const highlights = highlightsFor(
      syntheticFinding([
        evidenceItem(
          EVIDENCE_LABEL.invoiceDate,
          invoice.invoiceDate,
          invoice,
          INVOICE_LABEL.date,
        ),
      ]),
    );
    expect([...highlights.header]).toEqual(["invoiceDate"]);
  });

  it("marks an unrecognized charge line", () => {
    const invoice = invoiceNumbered("NL-88310");
    const highlights = highlightsFor(
      syntheticFinding([
        evidenceItem(
          EVIDENCE_LABEL.chargeBilled,
          "$10.00",
          invoice,
          chargeLocator(3),
        ),
      ]),
    );
    expect([...highlights.charges]).toEqual([3]);
  });

  it("ignores proof labels and evidence from other documents", () => {
    const invoice = invoiceNumbered("NL-88310");
    const other = invoiceNumbered("NL-88203");
    const highlights = highlightsFor(
      syntheticFinding([
        evidenceItem(
          EVIDENCE_LABEL.priceUsed,
          "$1.00",
          invoice,
          lineLocator(1),
        ),
        evidenceItem(
          EVIDENCE_LABEL.subtotal,
          "$1.00",
          invoice,
          INVOICE_LABEL.subtotal,
        ),
        evidenceItem(
          EVIDENCE_LABEL.billedUnitPrice,
          "$1.00",
          other,
          lineLocator(1),
        ),
        evidenceItem(
          EVIDENCE_LABEL.invoiceNumber,
          other.invoiceNumber,
          other,
          INVOICE_LABEL.number,
        ),
      ]),
    );
    expect(isEmpty(highlights)).toBe(true);
  });

  it("merges two figures on the same line", () => {
    const invoice = invoiceNumbered("NL-88310");
    const highlights = highlightsFor(
      syntheticFinding([
        evidenceItem(
          EVIDENCE_LABEL.billedUnitPrice,
          "$1.00",
          invoice,
          lineLocator(1),
        ),
        evidenceItem(
          EVIDENCE_LABEL.quantityBilled,
          "5",
          invoice,
          lineLocator(1),
        ),
      ]),
    );
    expect([...(highlights.lines.get(1) ?? [])].sort()).toEqual([
      "quantity",
      "unitPrice",
    ]);
  });
});

describe("citationsFor (spec 0008, AC-6)", () => {
  it("lists each distinct filename and locator in evidence order", () => {
    expect(citationsFor(findingEndingWith("NL-88310:surcharge-fuel"))).toBe(
      "NL-88310.pdf, charge line 1 · NL-88310.pdf, Subtotal · C-2026-014.pdf, Section 5.1",
    );
  });

  it("drops a repeated source", () => {
    const invoice = invoiceNumbered("NL-88310");
    expect(
      citationsFor(
        syntheticFinding([
          evidenceItem(
            EVIDENCE_LABEL.billedUnitPrice,
            "$1",
            invoice,
            lineLocator(1),
          ),
          evidenceItem(
            EVIDENCE_LABEL.quantityBilled,
            "5",
            invoice,
            lineLocator(1),
          ),
        ]),
      ),
    ).toBe("NL-88310.pdf, line 1");
  });
});
