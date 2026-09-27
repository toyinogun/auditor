import { describe, expect, it } from "vitest";
import { CheckId, FindingAction } from "@/lib/schemas/enums";
import { ACTION_LABEL, CHECK_LABEL, DECISION_LABEL } from "./labels";
import {
  AMOUNT_COLUMN,
  EXPORT_HEADER,
  ExportFormat,
  exportTable,
  type Cell,
} from "./table";
import { exportFinding, exportSnapshot } from "./testing";

const NOW = Date.UTC(2026, 8, 27, 14, 5);
const DECIDED_AT = Date.UTC(2026, 8, 27, 11, 42, 30);

const text = (value: string): Cell => ({ kind: "text", value });
const money = (cents: number): Cell => ({ kind: "money", cents });
const count = (value: number): Cell => ({ kind: "count", value });
const EMPTY: Cell = { kind: "empty" };

describe("ExportFormat (spec 0009, AC-3)", () => {
  it.each(["xlsx", "csv"])("accepts %s", (format) => {
    expect(ExportFormat.safeParse(format).success).toBe(true);
  });

  it.each([null, "", "pdf", "XLSX", "xlsx ", " csv"])(
    "refuses %j",
    (format) => {
      expect(ExportFormat.safeParse(format).success).toBe(false);
    },
  );
});

describe("labels (spec 0009, AC-5)", () => {
  it("names every check, action and decision in plain words", () => {
    expect(CheckId.options.map((id) => CHECK_LABEL[id])).toEqual([
      "Price above contract",
      "Duplicate invoice",
      "Quantity above received",
      "Surcharge",
      "Freight",
      "Missing reference",
    ]);
    expect(FindingAction.options.map((id) => ACTION_LABEL[id])).toEqual([
      "Recover",
      "Block payment",
      "Review only",
    ]);
    expect(DECISION_LABEL).toEqual({
      pending: "Pending",
      approved: "Approved",
      rejected: "Rejected",
    });
  });
});

describe("exportTable (spec 0009)", () => {
  it("has the 11 headers in order, Amount sixth (AC-4)", () => {
    expect(EXPORT_HEADER).toEqual([
      "Supplier",
      "Invoice",
      "Check",
      "Action",
      "Finding",
      "Amount (USD)",
      "Calculation",
      "Evidence",
      "Decision",
      "Reason",
      "Decided at (UTC)",
    ]);
    expect(EXPORT_HEADER[AMOUNT_COLUMN]).toBe("Amount (USD)");
  });

  it("writes a pending finding with its evidence and blank decision fields (AC-4, AC-6)", () => {
    const table = exportTable(exportSnapshot([exportFinding()]), NOW);
    expect(table.rows).toEqual([
      [
        text("Northline Industrial"),
        text("NL88310"),
        text("Duplicate invoice"),
        text("Recover"),
        text("Duplicate of NL88301"),
        money(814_100),
        text("Same supplier, total and lines as NL88301"),
        text("NL88310.pdf, header · NL88301.pdf, header"),
        text("Pending"),
        EMPTY,
        EMPTY,
      ],
    ]);
  });

  it("keeps the snapshot's row order (AC-4)", () => {
    const table = exportTable(
      exportSnapshot([
        exportFinding({ invoiceNumber: "A", amountCents: 3 }),
        exportFinding({ invoiceNumber: "B", amountCents: 2 }),
        exportFinding({ invoiceNumber: "C", amountCents: 1 }),
      ]),
      NOW,
    );
    expect(table.rows.map((row) => row[1])).toEqual([
      text("A"),
      text("B"),
      text("C"),
    ]);
  });

  it("writes an approved finding's time and no reason (AC-6)", () => {
    const [row] = exportTable(
      exportSnapshot([
        exportFinding({
          decision: { status: "approved", reason: null, decidedAt: DECIDED_AT },
        }),
      ]),
      NOW,
    ).rows;
    expect(row.slice(8)).toEqual([
      text("Approved"),
      EMPTY,
      text("2026-09-27 11:42"),
    ]);
  });

  it("writes a rejected finding's reason and time (AC-6)", () => {
    const [row] = exportTable(
      exportSnapshot([
        exportFinding({
          action: "review_only",
          checkId: "missing_reference",
          decision: {
            status: "rejected",
            reason: "PO sent by email",
            decidedAt: DECIDED_AT,
          },
        }),
      ]),
      NOW,
    ).rows;
    expect(row.slice(2, 4)).toEqual([
      text("Missing reference"),
      text("Review only"),
    ]);
    expect(row.slice(8)).toEqual([
      text("Rejected"),
      text("PO sent by email"),
      text("2026-09-27 11:42"),
    ]);
  });

  it("writes the two total rows from the tile figures (AC-8)", () => {
    const table = exportTable(
      exportSnapshot([exportFinding()], {
        totals: { approvedCents: 814_100, pendingCount: 0, findingCount: 1 },
      }),
      NOW,
    );
    const totalRow = (label: string, cents: number): readonly Cell[] =>
      EXPORT_HEADER.map((_, index) =>
        index === 0
          ? text(label)
          : index === AMOUNT_COLUMN
            ? money(cents)
            : EMPTY,
      );
    expect(table.totals).toEqual([
      totalRow("Total recoverable", 976_685),
      totalRow("Total approved", 814_100),
    ]);
  });

  it("gives no rows and zero totals for a run with no findings (AC-4, AC-8)", () => {
    const table = exportTable(
      exportSnapshot([], {
        headline: { recoverableCents: 0, recoverableShare: "0.0%" },
      }),
      NOW,
    );
    expect(table.rows).toEqual([]);
    expect(table.totals.map((row) => row[AMOUNT_COLUMN])).toEqual([
      money(0),
      money(0),
    ]);
  });

  it("lists the Summary pairs in order (AC-9)", () => {
    const table = exportTable(
      exportSnapshot([exportFinding(), exportFinding()], {
        totals: { approvedCents: 814_100, pendingCount: 1, findingCount: 2 },
      }),
      NOW,
    );
    expect(table.summary).toEqual([
      ["Audit run finished (UTC)", text("2026-09-27 09:30")],
      ["Exported at (UTC)", text("2026-09-27 14:05")],
      ["Invoices checked", count(10)],
      ["Invoiced total", money(5_400_000)],
      ["Findings", count(2)],
      ["Recoverable", money(976_685)],
      ["Approved", money(814_100)],
      ["Pending", text("1 of 2")],
      ["% of invoiced", text("18.1%")],
    ]);
  });
});
