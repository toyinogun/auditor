import { cellText, type Cell, type ExportRow, type ExportTable } from "./table";

/**
 * The .csv writer (spec 0009, AC-11): UTF-8 with a BOM so Excel reads `·` and `−`, CRLF line
 * endings and RFC 4180 quoting. Text that starts like a formula gets a leading `'`, since a
 * supplier name, filename or reason comes from outside the app. Money is generated, so unguarded.
 */

const BOM = "\uFEFF";
const CRLF = "\r\n";
const FORMULA_START = /^[=+\-@\t\r]/;
const NEEDS_QUOTES = /[",\r\n]/;

const guard = (value: string): string =>
  FORMULA_START.test(value) ? `'${value}` : value;

const quote = (value: string): string =>
  NEEDS_QUOTES.test(value) ? `"${value.replaceAll('"', '""')}"` : value;

export const csvField = (cell: Cell): string =>
  cell.kind === "text" ? quote(guard(cell.value)) : cellText(cell);

const csvLine = (row: ExportRow): string => row.map(csvField).join(",");

const headerCells = (header: readonly string[]): ExportRow =>
  header.map((value) => ({ kind: "text", value }));

/** Header, rows, one blank row (always), then the two totals; every line ends in CRLF. */
export const toCsv = (table: ExportTable): string =>
  BOM +
  [
    csvLine(headerCells(table.header)),
    ...table.rows.map(csvLine),
    "",
    ...table.totals.map(csvLine),
  ]
    .map((line) => line + CRLF)
    .join("");
