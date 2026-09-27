# lib/export

The finding log as `.xlsx` and `.csv` (spec [0009 export](../../docs/specs/0009-export/index.md)). Pure: no Next, DB, SDK or `fetch` imports. The snapshot and the request time come in as values; `lib/audit/export.ts` reads the database and serves the route.

## Files

- `table.ts`: `exportTable(snapshot, now)`, the one row model both writers format, so the two files can never disagree. Header (`EXPORT_HEADER`), one row per finding in snapshot order, then the two total rows and the Summary pairs. `Cell` is `text`, `money` (integer cents), `count` or `empty`. `ExportFormat` is the Zod enum the route parses.
- `labels.ts`: `CHECK_LABEL`, `ACTION_LABEL`, `DECISION_LABEL`, exhaustive `Record`s over the Zod enums, so a new enum value fails typecheck until it has a label (AC-5).
- `format.ts`: `centsToPlain` (money by string formatting, never float division), `utcMinute` (`YYYY-MM-DD HH:MM` in UTC), `exportFileName`.
- `csv.ts`: `toCsv`, UTF-8 with a BOM, CRLF, RFC 4180 quoting and the formula guard (a leading `'` on text starting with `=`, `+`, `-`, `@`, tab or CR).
- `xlsx.ts`: `toXlsx`, the Findings and Summary sheets via `exceljs`. Money and counts are number cells, text is string cells.
- `testing.ts`: test builders (`exportFinding`, `exportSnapshot`); never imported by app code.

## Conventions

- Add a column or a Summary row in `table.ts` only; both writers pick it up. Never format content inside a writer.
- The formula guard lives in `csv.ts` only. `exceljs` string cells are never evaluated, so guarding the `.xlsx` would add stray `'` marks (spec 0009, Decision).
- Totals are written values, never spreadsheet formulas, and they come from the same functions as the review tiles (`headlineFor`, `reviewTotals`), so a file always equals the screen.
- `exceljs` builds the workbook by mutation; keep that inside `toXlsx`, which returns bytes.

_Drafted by /sync from the introducing change, worth a quick human pass._
