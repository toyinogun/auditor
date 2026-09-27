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
