/**
 * CSV text (spec 0003): UTF 8 without a byte order mark, LF line endings, a trailing newline,
 * and RFC 4180 quoting only when a cell holds a comma, quote or newline. Pure.
 */

const NEEDS_QUOTES = /[",\n\r]/;

const quoteCell = (cell: string): string =>
  NEEDS_QUOTES.test(cell) ? `"${cell.replaceAll('"', '""')}"` : cell;

export const toCsv = (
  header: readonly string[],
  rows: readonly (readonly string[])[],
): string =>
  [header, ...rows].map((row) => row.map(quoteCell).join(",")).join("\n") +
  "\n";

/** Rows of objects as CSV cells in `header` order. */
export const toCsvRows = <K extends string>(
  header: readonly K[],
  rows: readonly Readonly<Record<K, string>>[],
): readonly (readonly string[])[] =>
  rows.map((row) => header.map((key) => row[key]));

/** Reads CSV text written by `toCsv` (RFC 4180 quoting) back into header and rows. */
export const parseCsv = (
  csvText: string,
): {
  readonly header: readonly string[];
  readonly rows: readonly (readonly string[])[];
} => {
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
