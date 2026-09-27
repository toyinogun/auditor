import { describe, expect, it } from "vitest";
import { Finding } from "@/lib/schemas/finding";
import { briefSampleRecords } from "@/lib/schemas/fixtures/brief-sample-records";
import type { AuditInput } from "@/lib/schemas/records";
import { runChecks, summarizeFindings } from "./index";

const sample = briefSampleRecords();
const findings = runChecks(sample);
const docId = (number: string): number => {
  const found = sample.invoices.find((i) => i.invoiceNumber === number);
  if (!found) throw new Error(`no invoice ${number}`);
  return found.documentId;
};

/** The brief's expected findings (AC-1, AC-7). Fix the code, never these numbers. */
const EXPECTED = [
  [
    "NL88310",
    "duplicate",
    "recover",
    "-",
    814100,
    "Invoice total $8,141.00, paid twice (ap_payments.csv rows 4, 5) = $8,141.00",
  ],
  [
    "NL-88203",
    "quantity_received",
    "recover",
    "NL-BLT-A42",
    39000,
    "(400 billed − 360 received) × $9.75 = $390.00",
  ],
  [
    "NL-88310",
    "contract_price",
    "recover",
    "NL-BRG-6204",
    37500,
    "($5.10 − $4.85) × 1,500 = $375.00",
  ],
  [
    "BW-5521",
    "surcharge",
    "recover",
    "surcharge-energy",
    31110,
    "$311.10 energy surcharge, none permitted = $311.10",
  ],
  [
    "NL-88203",
    "contract_price",
    "recover",
    "NL-GSK-0850",
    25000,
    "($0.97 − $0.92) × 5,000 = $250.00",
  ],
  [
    "NL-88310",
    "freight",
    "recover",
    "freight",
    18500,
    "$185.00 freight, included in contract price = $185.00",
  ],
  [
    "NL-88310",
    "surcharge",
    "recover",
    "surcharge-fuel",
    11475,
    "$306.00 − 2.5% × $7,650.00 = $114.75",
  ],
  [
    "BW-5530",
    "missing_reference",
    "review_only",
    "po",
    0,
    "Review only, no amount claimed",
  ],
] as const;

const SUPPLIER: Record<string, string> = {
  NL: "northline industrial supply",
  BW: "brightwater packaging",
};

const shuffled = <T>(items: readonly T[], seed: number): readonly T[] =>
  items
    .map((item, index) => ({ item, rank: (index * 7919 + seed * 104729) % 97 }))
    .sort((a, b) => a.rank - b.rank || 0)
    .map(({ item }) => item);

describe("runChecks on the brief sample (acceptance test)", () => {
  it("returns exactly the 8 expected findings in order (AC-1, AC-7)", () => {
    expect(
      findings.map((f) => [
        f.invoiceDocumentId,
        f.checkId,
        f.action,
        f.findingKey,
        f.amountCents,
        f.calculation,
      ]),
    ).toEqual(
      EXPECTED.map(([invoice, check, action, detail, cents, calculation]) => [
        docId(invoice),
        check,
        action,
        `${check}:${SUPPLIER[invoice.slice(0, 2)]}:${invoice}:${detail}`,
        cents,
        calculation,
      ]),
    );
  });

  it("summarizes to $9,766.85 recoverable, 18.1% of $53,939.60 (AC-2)", () => {
    expect(summarizeFindings(sample.invoices, findings)).toEqual({
      invoiceCount: 6,
      invoicedTotalCents: 5393960,
      recoverableCents: 976685,
      blockedCents: 0,
      findingCount: 8,
      recoverableShare: "18.1%",
    });
  });

  it("leaves NL-88121 clean, fuel exactly at its cap included (AC-3)", () => {
    expect(
      findings.filter((f) => f.invoiceDocumentId === docId("NL-88121")),
    ).toEqual([]);
  });

  it("counts the duplicate's price and freight only once (AC-4)", () => {
    expect(
      findings
        .filter((f) => f.invoiceDocumentId === docId("NL88310"))
        .map((f) => f.checkId),
    ).toEqual(["duplicate"]);
  });

  it("backs every figure with a sourced evidence item (AC-8)", () => {
    const LOCATOR =
      /^(line \d+|charge line \d+|row \d+|Invoice number|Invoice date|PO number|Subtotal|Invoice total|Schedule A, item \d+|Section [\d.]+)$/;
    findings.forEach((finding) => {
      expect(finding.evidence.length).toBeGreaterThan(0);
      finding.evidence.forEach((item) =>
        expect(item.source.locator).toMatch(LOCATOR),
      );
      const values = finding.evidence.map((item) => item.value).join(" | ");
      // Input figures only: the result after " = " is computed, not read from a document.
      const inputs = finding.calculation.split(" = ")[0];
      const figures =
        inputs.match(
          /\$[\d,]+\.\d{2}|\b\d[\d,]*(?= (billed|received))|(?<= × )[\d,]+$|[\d.]+%/g,
        ) ?? [];
      figures.forEach((figure) => expect(values).toContain(figure));
    });
    const evidenceOf = (key: string) =>
      findings
        .find((f) => f.findingKey.endsWith(key))
        ?.evidence.map((e) => [
          e.label,
          e.value,
          e.source.filename,
          e.source.locator,
        ]);
    expect(evidenceOf("NL-88310:surcharge-fuel")).toEqual([
      ["Surcharge billed", "$306.00", "NL-88310.pdf", "charge line 1"],
      ["Subtotal", "$7,650.00", "NL-88310.pdf", "Subtotal"],
      ["Cap", "2.5%", "C-2026-014.pdf", "Section 5.1"],
    ]);
    expect(evidenceOf("NL-88203:NL-BLT-A42")).toEqual([
      ["Quantity billed", "400", "NL-88203.pdf", "line 3"],
      ["Quantity received", "360", "receipts.csv", "row 5"],
      ["Price used", "$9.75", "C-2026-014.pdf", "Schedule A, item 5"],
    ]);
  });

  it("parses every finding and keeps keys unique (AC-14)", () => {
    findings.forEach((finding) =>
      expect(Finding.parse(finding)).toEqual(finding),
    );
    expect(new Set(findings.map((f) => f.findingKey)).size).toBe(
      findings.length,
    );
  });

  it("returns the same list whatever the input order (AC-14)", () => {
    [1, 2, 3].forEach((seed) => {
      const input: AuditInput = {
        invoices: shuffled(sample.invoices, seed),
        contracts: shuffled(sample.contracts, seed),
        purchaseOrders: shuffled(sample.purchaseOrders, seed),
        receipts: shuffled(sample.receipts, seed),
        payments: shuffled(sample.payments, seed),
      };
      expect(runChecks(input)).toEqual(findings);
    });
  });
});

describe("runChecks, payment status (AC-5, AC-6)", () => {
  it("blocks the duplicate when its payment row is missing", () => {
    const input = {
      ...sample,
      payments: sample.payments.filter((p) => p.invoiceNumber !== "NL88310"),
    };
    const result = runChecks(input);
    expect(result[0]).toMatchObject({
      checkId: "duplicate",
      action: "block_payment",
      amountCents: 814100,
    });
    const summary = summarizeFindings(input.invoices, result);
    expect([summary.recoverableCents, summary.blockedCents]).toEqual([
      162585, 814100,
    ]);
  });

  it("blocks both NL-88203 findings when it is unpaid", () => {
    const result = runChecks({
      ...sample,
      payments: sample.payments.filter((p) => p.invoiceNumber !== "NL-88203"),
    });
    const nl88203 = result.filter(
      (f) => f.invoiceDocumentId === docId("NL-88203"),
    );
    expect(nl88203.map((f) => f.action)).toEqual([
      "block_payment",
      "block_payment",
    ]);
  });
});

describe("runChecks, empty input (AC-2, AC-14)", () => {
  it("finds nothing and summarizes to zeros", () => {
    const empty: AuditInput = {
      invoices: [],
      contracts: [],
      purchaseOrders: [],
      receipts: [],
      payments: [],
    };
    expect(runChecks(empty)).toEqual([]);
    expect(summarizeFindings([], []).recoverableShare).toBe("0.0%");
  });
});
