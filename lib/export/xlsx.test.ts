import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { exportTable } from "./table";
import { exportFinding, exportSnapshot } from "./testing";
import { toXlsx } from "./xlsx";

const NOW = Date.UTC(2026, 8, 27, 14, 5);
const MONEY_FORMAT = '"$"#,##0.00';

const readBack = async (bytes: Uint8Array): Promise<ExcelJS.Workbook> => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes as unknown as ExcelJS.Buffer);
  return workbook;
};

const sheet = (workbook: ExcelJS.Workbook, name: string): ExcelJS.Worksheet => {
  const found = workbook.getWorksheet(name);
  if (found === undefined) throw new Error(`no ${name} sheet`);
  return found;
};

const twoFindings = exportSnapshot([
  exportFinding(),
  exportFinding({
    invoiceNumber: "BW-5530",
    supplierName: '=HYPERLINK("x")',
    checkId: "missing_reference",
    action: "review_only",
    amountCents: 0,
    decision: {
      status: "rejected",
      reason: '-1+1, "quoted"\nnext line',
      decidedAt: Date.UTC(2026, 8, 27, 11, 42),
    },
  }),
]);

describe("toXlsx (spec 0009, AC-7, AC-9)", () => {
  it("writes two sheets, Findings then Summary", async () => {
    const workbook = await readBack(
      await toXlsx(exportTable(twoFindings, NOW)),
    );
    expect(workbook.worksheets.map((ws) => ws.name)).toEqual([
      "Findings",
      "Summary",
    ]);
  });

  it("bolds and freezes the header and filters only the finding rows", async () => {
    const findings = sheet(
      await readBack(await toXlsx(exportTable(twoFindings, NOW))),
      "Findings",
    );
    expect(findings.getRow(1).getCell(1).value).toBe("Supplier");
    expect(findings.getRow(1).getCell(11).value).toBe("Decided at (UTC)");
    expect(findings.getRow(1).font?.bold).toBe(true);
    expect(findings.views[0]).toMatchObject({ state: "frozen", ySplit: 1 });
    expect(findings.autoFilter).toBe("A1:K3");
  });

  it("writes rows, a blank row and bold money totals", async () => {
    const findings = sheet(
      await readBack(await toXlsx(exportTable(twoFindings, NOW))),
      "Findings",
    );
    const amount = findings.getRow(2).getCell(6);
    expect(amount.value).toBe(8141);
    expect(amount.numFmt).toBe(MONEY_FORMAT);
    expect(findings.getRow(3).getCell(6).value).toBe(0);
    expect(findings.getRow(4).hasValues).toBe(false);
    const recoverable = findings.getRow(5);
    expect(recoverable.getCell(1).value).toBe("Total recoverable");
    expect(recoverable.getCell(6).value).toBe(9766.85);
    expect(recoverable.getCell(6).numFmt).toBe(MONEY_FORMAT);
    expect(recoverable.font?.bold).toBe(true);
    expect(findings.getRow(6).getCell(1).value).toBe("Total approved");
    expect(findings.getRow(6).getCell(6).value).toBe(0);
  });

  it("writes outside text as plain strings, never formulas (AC-11)", async () => {
    const findings = sheet(
      await readBack(await toXlsx(exportTable(twoFindings, NOW))),
      "Findings",
    );
    const supplier = findings.getRow(3).getCell(1);
    expect(supplier.type).toBe(ExcelJS.ValueType.String);
    expect(supplier.value).toBe('=HYPERLINK("x")');
    expect(findings.getRow(3).getCell(10).value).toBe(
      '-1+1, "quoted"\nnext line',
    );
    expect(findings.getRow(3).getCell(11).value).toBe("2026-09-27 11:42");
  });

  it("sets the column widths and wraps Calculation, Evidence and Reason", async () => {
    const findings = sheet(
      await readBack(await toXlsx(exportTable(twoFindings, NOW))),
      "Findings",
    );
    expect(findings.columns.map((column) => column.width)).toEqual([
      28, 14, 24, 14, 40, 14, 48, 56, 12, 40, 18,
    ]);
    expect(
      [7, 8, 10].map((index) => findings.getColumn(index).alignment?.wrapText),
    ).toEqual([true, true, true]);
  });

  it("spans the filter over the header alone with no findings", async () => {
    const findings = sheet(
      await readBack(
        await toXlsx(
          exportTable(
            exportSnapshot([], {
              headline: { recoverableCents: 0, recoverableShare: "0.0%" },
            }),
            NOW,
          ),
        ),
      ),
      "Findings",
    );
    expect(findings.autoFilter).toBe("A1:K1");
    expect(findings.getRow(2).hasValues).toBe(false);
    expect(findings.getRow(3).getCell(1).value).toBe("Total recoverable");
    expect(findings.getRow(3).getCell(6).value).toBe(0);
  });

  it("writes the Summary pairs with money as money cells", async () => {
    const summary = sheet(
      await readBack(await toXlsx(exportTable(twoFindings, NOW))),
      "Summary",
    );
    const pairs = summary
      .getSheetValues()
      .slice(1)
      .map((row) => (row as unknown[]).slice(1, 3));
    expect(pairs).toEqual([
      ["Audit run finished (UTC)", "2026-09-27 09:30"],
      ["Exported at (UTC)", "2026-09-27 14:05"],
      ["Invoices checked", "10"],
      ["Invoiced total", 54000],
      ["Findings", "2"],
      ["Recoverable", 9766.85],
      ["Approved", 0],
      ["Pending", "2 of 2"],
      ["% of invoiced", "18.1%"],
    ]);
    expect(summary.getRow(4).getCell(2).numFmt).toBe(MONEY_FORMAT);
  });
});
