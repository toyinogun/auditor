import { describe, expect, it } from "vitest";
import { runChecks } from "@/lib/checks";
import { briefSampleRecords } from "@/lib/schemas/fixtures/brief-sample-records";
import type { AuditInput } from "@/lib/schemas/records";
import {
  compareFindings,
  compareKinds,
  compareRecords,
  formatMismatch,
} from "./compare";

const offline = briefSampleRecords();

const withInvoice = (
  input: AuditInput,
  index: number,
  change: (
    invoice: AuditInput["invoices"][number],
  ) => AuditInput["invoices"][number],
): AuditInput => ({
  ...input,
  invoices: input.invoices.map((invoice, at) =>
    at === index ? change(invoice) : invoice,
  ),
});

describe("compareRecords (AC-9)", () => {
  it("finds nothing when the records are identical", () => {
    expect(compareRecords(briefSampleRecords(), offline)).toEqual([]);
  });

  it("reports a changed price and lets a clause's spacing through", () => {
    const priced = withInvoice(offline, 1, (invoice) => ({
      ...invoice,
      lines: invoice.lines.map((line, at) =>
        at === 0 ? { ...line, unitPriceCents: 92 } : line,
      ),
    }));
    const spaced: AuditInput = {
      ...priced,
      contracts: priced.contracts.map((contract, at) =>
        at === 0
          ? {
              ...contract,
              prices: contract.prices.map((price, i) =>
                i === 0
                  ? {
                      ...price,
                      clause: `  ${price.clause.replace(" ", "   ")} `,
                    }
                  : price,
              ),
            }
          : contract,
      ),
    };
    const mismatches = compareRecords(spaced, offline);
    expect(mismatches).toEqual([
      {
        filename: "NL-88203.pdf",
        path: "lines[0].unitPriceCents",
        live: "92",
        offline: "97",
      },
    ]);
    expect(formatMismatch(mismatches[0])).toBe(
      "NL-88203.pdf: lines[0].unitPriceCents: live 92, offline 97",
    );
  });

  it("compares everything else exactly, invoice numbers included", () => {
    const renamed = withInvoice(offline, 0, (invoice) => ({
      ...invoice,
      invoiceNumber: "NL 88121",
    }));
    expect(compareRecords(renamed, offline)).toEqual([
      expect.objectContaining({ path: "invoiceNumber" }),
    ]);
  });

  it("names a missing line and a missing CSV row", () => {
    const shorter: AuditInput = {
      ...withInvoice(offline, 0, (invoice) => ({
        ...invoice,
        lines: invoice.lines.slice(0, 1),
      })),
      receipts: offline.receipts.slice(1),
    };
    const paths = compareRecords(shorter, offline).map(
      (m) => `${m.filename} ${m.path}`,
    );
    expect(paths).toContain("NL-88121.pdf lines[1]");
    expect(paths.some((path) => path.startsWith("receipts.csv rows["))).toBe(
      true,
    );
  });

  it("names a whole record present on one side only", () => {
    const fewer: AuditInput = {
      ...offline,
      invoices: offline.invoices.slice(1),
    };
    expect(compareRecords(fewer, offline)).toEqual([
      expect.objectContaining({
        filename: "NL-88121.pdf",
        path: "record",
        live: "missing",
      }),
    ]);
  });
});

describe("compareFindings (AC-9)", () => {
  const findings = runChecks(offline);
  const filenameOf = (id: number) =>
    offline.invoices.find((invoice) => invoice.documentId === id)?.filename ??
    "?";

  it("finds nothing when the findings match", () => {
    expect(compareFindings(findings, findings, filenameOf)).toEqual([]);
  });

  it("names a changed amount and a finding on one side only", () => {
    const [first, ...rest] = findings;
    const live = [
      { ...first, amountCents: first.amountCents + 1 },
      ...rest.slice(1),
    ];
    const mismatches = compareFindings(live, findings, filenameOf);
    expect(mismatches).toHaveLength(2);
    expect(mismatches[0]).toMatchObject({
      filename: filenameOf(first.invoiceDocumentId),
      path: `finding ${first.findingKey}`,
    });
    expect(mismatches[1]).toMatchObject({ live: "missing" });
  });
});

describe("compareKinds", () => {
  it("names a file classified as the wrong kind", () => {
    expect(
      compareKinds(
        [
          { filename: "PO-4501.pdf", kind: "purchase_order" },
          { filename: "BW-5521.pdf", kind: "invoice" },
        ],
        new Map([["PO-4501.pdf", "invoice"]]),
      ),
    ).toEqual([
      {
        filename: "PO-4501.pdf",
        path: "kind",
        live: "invoice",
        offline: "purchase_order",
      },
      {
        filename: "BW-5521.pdf",
        path: "kind",
        live: "missing",
        offline: "invoice",
      },
    ]);
  });
});
