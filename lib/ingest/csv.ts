import { PaymentCsvRow, ReceiptCsvRow } from "@/lib/schemas/extraction";
import { err, ok, type Result } from "@/lib/schemas/result";

/**
 * CSV parsing for ingest (spec 0005, AC-8). Pure: no database, no model. The header must match
 * the spec 0002 columns exactly and in order; each cell maps to the column at its position.
 */

export type ParsedCsv = {
  readonly header: readonly string[];
  readonly rows: readonly (readonly string[])[];
};

/**
 * Reads RFC 4180 CSV text into header and rows: quoted cells may hold commas, quotes and
 * newlines, and lines may end in LF or CRLF.
 */
export const parseCsv = (csvText: string): ParsedCsv => {
  type State = {
    readonly rows: readonly (readonly string[])[];
    readonly row: readonly string[];
    readonly cell: string;
    readonly quoted: boolean;
    readonly skip: boolean;
  };
  const initial: State = {
    rows: [],
    row: [],
    cell: "",
    quoted: false,
    skip: false,
  };
  const end = [...csvText].reduce<State>((state, char, index, chars) => {
    if (state.skip) return { ...state, skip: false };
    if (state.quoted) {
      if (char !== '"') return { ...state, cell: state.cell + char };
      return chars[index + 1] === '"'
        ? { ...state, cell: state.cell + '"', skip: true }
        : { ...state, quoted: false };
    }
    if (char === '"') return { ...state, quoted: true };
    if (char === ",")
      return { ...state, row: [...state.row, state.cell], cell: "" };
    if (char === "\r" && chars[index + 1] === "\n") return state;
    if (char === "\n") {
      return {
        ...state,
        rows: [...state.rows, [...state.row, state.cell]],
        row: [],
        cell: "",
      };
    }
    return { ...state, cell: state.cell + char };
  }, initial);
  const rows =
    end.row.length > 0 || end.cell.length > 0
      ? [...end.rows, [...end.row, end.cell]]
      : end.rows;
  const [header = [], ...data] = rows;
  return { header, rows: data };
};

export const RECEIPTS_COLUMNS = ReceiptCsvRow.keyof().options;
export const PAYMENTS_COLUMNS = PaymentCsvRow.keyof().options;

const checkHeader = (
  expected: readonly string[],
  found: readonly string[],
): Result<true> => {
  const position = expected.findIndex(
    (column, index) => index < found.length && found[index] !== column,
  );
  if (position !== -1) {
    return err(
      `column ${position + 1}: expected ${expected[position]}, found ${found[position]}`,
    );
  }
  return found.length === expected.length
    ? ok(true)
    : err(`expected ${expected.length} columns, found ${found.length}`);
};

const toRows = <K extends string>(
  columns: readonly K[],
  csvText: string,
): Result<readonly Readonly<Record<K, string>>[]> => {
  const { header, rows } = parseCsv(csvText);
  const headerCheck = checkHeader(columns, header);
  if (!headerCheck.ok) return headerCheck;
  const badRow = rows.findIndex((cells) => cells.length !== columns.length);
  if (badRow !== -1) {
    return err(
      `row ${badRow + 1}: expected ${columns.length} cells, found ${rows[badRow].length}`,
    );
  }
  return ok(
    rows.map(
      (cells) =>
        Object.fromEntries(
          columns.map((column, index) => [column, cells[index]]),
        ) as Readonly<Record<K, string>>,
    ),
  );
};

export type CsvKind = "receipts_csv" | "payments_csv";

/**
 * Which CSV this is, judged on the header line alone, whatever the file is called (spec 0006,
 * AC-2). A header matching neither gives both parsers' reasons.
 */
export const csvKindOf = (csvText: string): Result<CsvKind> => {
  const lineEnd = csvText.indexOf("\n");
  const firstLine = lineEnd === -1 ? csvText : csvText.slice(0, lineEnd);
  const { header } = parseCsv(firstLine.replace(/\r$/, ""));
  const receipts = checkHeader(RECEIPTS_COLUMNS, header);
  if (receipts.ok) return ok("receipts_csv");
  const payments = checkHeader(PAYMENTS_COLUMNS, header);
  if (payments.ok) return ok("payments_csv");
  return err(
    `not a receipts or payments CSV: receipts: ${receipts.error}; payments: ${payments.error}`,
  );
};

/** `receipts.csv` text to rows, header checked. Row N counts data rows from 1. */
export const parseReceiptsCsv = (
  csvText: string,
): Result<readonly ReceiptCsvRow[]> => toRows(RECEIPTS_COLUMNS, csvText);

/** `ap_payments.csv` text to rows, header checked. Row N counts data rows from 1. */
export const parsePaymentsCsv = (
  csvText: string,
): Result<readonly PaymentCsvRow[]> => toRows(PAYMENTS_COLUMNS, csvText);
