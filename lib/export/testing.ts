import type { DecisionState } from "@/lib/schemas/finding";
import type { ExportFinding, ExportSnapshot } from "./table";

/** Test support: export findings and snapshots without a database. Not imported by app code. */

export const PENDING: DecisionState = { status: "pending" };

export const exportFinding = (
  overrides: Partial<ExportFinding> = {},
): ExportFinding => ({
  findingKey: "duplicate:NL88310",
  checkId: "duplicate",
  action: "recover",
  invoiceDocumentId: 1,
  amountCents: 814_100,
  title: "Duplicate of NL88301",
  calculation: "Same supplier, total and lines as NL88301",
  evidence: [
    {
      label: "Invoice number",
      value: "NL88310",
      source: { documentId: 1, filename: "NL88310.pdf", locator: "header" },
    },
    {
      label: "Invoice number",
      value: "NL88301",
      source: { documentId: 2, filename: "NL88301.pdf", locator: "header" },
    },
  ],
  supplierName: "Northline Industrial",
  invoiceNumber: "NL88310",
  decision: PENDING,
  ...overrides,
});

export const exportSnapshot = (
  findings: readonly ExportFinding[],
  overrides: Partial<Omit<ExportSnapshot, "findings">> = {},
): ExportSnapshot => ({
  run: {
    finishedAt: Date.UTC(2026, 8, 27, 9, 30),
    invoiceCount: 10,
    invoicedTotalCents: 5_400_000,
    findingCount: findings.length,
  },
  headline: { recoverableCents: 976_685, recoverableShare: "18.1%" },
  totals: {
    approvedCents: 0,
    pendingCount: findings.length,
    findingCount: findings.length,
  },
  findings,
  ...overrides,
});
