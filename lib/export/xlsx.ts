import ExcelJS from "exceljs";
import type { Cell, ExportRow, ExportTable } from "./table";

/**
 * The .xlsx writer (spec 0009, AC-7, AC-9): a Findings sheet and a Summary sheet. Money is a
 * number cell in dollars with a `$` format so Excel can sort and add it; totals are written
 * values. Text goes in as string cells, which Excel never evaluates, so no formula guard here.
 * exceljs builds the workbook by mutation; it stays inside this function and writes to a buffer.
 */

const CENTS_PER_DOLLAR = 100;
const MONEY_FORMAT = '"$"#,##0.00';
/** Characters, in `EXPORT_HEADER` order (AC-9). */
const FINDINGS_WIDTHS = [28, 14, 24, 14, 40, 14, 48, 56, 12, 40, 18];
/** Calculation, Evidence and Reason, 1-based. */
const WRAPPED_COLUMNS = [7, 8, 10];
const SUMMARY_WIDTHS = [28, 18];
const HEADER_ROW = 1;

const cellValue = (cell: Cell): ExcelJS.CellValue => {
  if (cell.kind === "text") return cell.value;
  return cell.kind === "money" ? cell.cents / CENTS_PER_DOLLAR : null;
};

const writeRow = (
  worksheet: ExcelJS.Worksheet,
  rowNumber: number,
  cells: ExportRow,
  bold = false,
): void => {
  const row = worksheet.getRow(rowNumber);
  cells.forEach((cell, index) => {
    const target = row.getCell(index + 1);
    target.value = cellValue(cell);
    if (cell.kind === "money") target.numFmt = MONEY_FORMAT;
  });
  if (bold) row.font = { bold: true };
};

/** A column letter for a 1-based index up to 26, enough for 11 columns. */
const columnLetter = (index: number): string =>
  String.fromCharCode("A".charCodeAt(0) + index - 1);

const addFindings = (workbook: ExcelJS.Workbook, table: ExportTable): void => {
  const worksheet = workbook.addWorksheet("Findings", {
    views: [{ state: "frozen", ySplit: HEADER_ROW }],
  });
  worksheet.columns = FINDINGS_WIDTHS.map((width) => ({ width }));
  WRAPPED_COLUMNS.forEach((index) => {
    worksheet.getColumn(index).alignment = {
      wrapText: true,
      vertical: "top",
    };
  });
  writeRow(
    worksheet,
    HEADER_ROW,
    table.header.map((value) => ({ kind: "text", value })),
    true,
  );
  table.rows.forEach((cells, index) =>
    writeRow(worksheet, HEADER_ROW + 1 + index, cells),
  );
  const lastFindingRow = HEADER_ROW + table.rows.length;
  worksheet.autoFilter = {
    from: `A${HEADER_ROW}`,
    to: `${columnLetter(table.header.length)}${lastFindingRow}`,
  };
  // One blank row after the findings, then the totals (AC-8).
  table.totals.forEach((cells, index) =>
    writeRow(worksheet, lastFindingRow + 2 + index, cells, true),
  );
};

const addSummary = (workbook: ExcelJS.Workbook, table: ExportTable): void => {
  const worksheet = workbook.addWorksheet("Summary");
  worksheet.columns = SUMMARY_WIDTHS.map((width) => ({ width }));
  table.summary.forEach(([label, cell], index) =>
    writeRow(worksheet, index + 1, [{ kind: "text", value: label }, cell]),
  );
};

export const toXlsx = async (
  table: ExportTable,
): Promise<Uint8Array<ArrayBuffer>> => {
  const workbook = new ExcelJS.Workbook();
  addFindings(workbook, table);
  addSummary(workbook, table);
  return new Uint8Array(await workbook.xlsx.writeBuffer());
};
