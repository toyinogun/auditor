# 0009. Export the finding log as .xlsx and .csv

**Date**: 2026-09-27
**Status**: Accepted

## Summary

This spec adds the Export button to the app bar. It opens a small menu with two choices, Excel (.xlsx) and CSV (.csv), and each one downloads the finding log straight away. The file lists every finding in the latest audit with its evidence and the analyst's decision, then two total rows: Total recoverable and Total approved. Those match the Recoverable and Approved tiles on the review screen at any moment, which settles the clash between spec 0004 (sum every `recover` finding) and spec 0008 (equal the Approved tile). The files are built fresh on each request from the same data the review screen reads, so nothing new goes into the database.

## Requirements

**User stories**:
- As an analyst, I want to download every finding with its evidence and my decision, so that I can hand a supplier (or my manager) a claim list without retyping anything.
- As an analyst, I want the file's totals to match the review screen, so that nobody has to reconcile two numbers.
- As a prospective client watching the demo, I want Export to work right after Load sample data, so that I see the whole loop (find, review, export) in one sitting.

**Acceptance criteria** (the contract, each criterion is IDed and independently checkable):
- **AC-1**: Export menu. The app bar shows **Export** as a secondary button (White, Pencil outline, 36px, `label-md`) beside Load sample data, which stays the one primary (`DESIGN.md` order: Load sample data, then Export). Pressing it opens a floating menu (the shadcn `DropdownMenu` in `components/ui/`, with `DESIGN.md`'s menu shadow and motion) holding two items in this order: **Excel (.xlsx)** and **CSV (.csv)**. Each item is a real link to `/api/export?format=xlsx` or `/api/export?format=csv` with the `download` attribute, so choosing it downloads the file without leaving the page. The menu works by keyboard (Enter or Space opens it, arrows move, Enter chooses, Escape closes and returns focus to the button). No amber anywhere in the button or menu.
- **AC-2**: No run yet. With no audit run in the database, Export is disabled (45% opacity, no hover, menu cannot open) and a tooltip reads "Load sample data first". The tooltip still shows on hover and on keyboard focus, so the disabled button sits inside a focusable wrapper. As soon as a run exists (after Load sample data, the next render), Export is enabled.
- **AC-3**: Export route. `GET /api/export?format=xlsx|csv` (Node runtime) answers `200` with the file as the body, `Content-Type` `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` or `text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="<name>"` (AC-10) and `Cache-Control: no-store`. A missing or other `format` answers `400` with the plain text `format must be xlsx or csv`. The match is exact: lowercase, no trimming, so `XLSX` or `xlsx ` also answers `400`. No audit run answers `404` with the plain text `No audit run yet`. Both errors carry `Content-Type: text/plain; charset=utf-8` and `Cache-Control: no-store`. Error bodies never include file or finding content.
- **AC-4**: Rows. Both files hold one row per finding in the latest run, in `listFindings` order (amount descending, then id), every finding included whatever its decision (pending, approved, rejected) or action. The columns, in order, with these exact header texts: **Supplier** · **Invoice** · **Check** · **Action** · **Finding** · **Amount (USD)** · **Calculation** · **Evidence** · **Decision** · **Reason** · **Decided at (UTC)**. Supplier is `supplierName`, Invoice is `invoiceNumber`, Finding is `title`, Calculation is `calculation` exactly as stored, and Evidence is `citationsFor(finding)` (the distinct `"<filename>, <locator>"` pairs joined with `" · "`, the same text as the review screen's citation line). A run with 0 findings (a run exists, so this is not AC-3's 404) gives the header row, the blank row and the two total rows reading `0.00` (AC-8).
- **AC-5**: Plain words. Check, Action and Decision are written as words, never codes. Check: `contract_price` "Price above contract", `duplicate` "Duplicate invoice", `quantity_received` "Quantity above received", `surcharge` "Surcharge", `freight` "Freight", `missing_reference` "Missing reference". Action: `recover` "Recover", `block_payment` "Block payment", `review_only` "Review only". Decision: "Pending", "Approved", "Rejected". The label maps are exhaustive `Record`s over the Zod enums, so a new enum value fails typecheck until it has a label.
- **AC-6**: Decision fields. Reason is the stored rejection reason, and blank for approved and pending findings. Decided at is the decision's `decidedAt` in UTC as `YYYY-MM-DD HH:MM` (for example `2026-09-27 14:05`), and blank when pending. A decision made on an older amount reads as pending (as `listFindings` already does), so both fields are blank for it.
- **AC-7**: Money. In the .xlsx, Amount and every total are number cells holding dollars (`amountCents / 100`) with the number format `"$"#,##0.00`, so Excel can sort, filter and add them. Totals are written values, not formulas. In the .csv, money is a plain decimal with exactly two places and no `$` or thousands separator (`8141.00`, `0.00`), built from the integer cents by string formatting, never by floating point division.
- **AC-8**: Total rows. After the finding rows, both files have one blank row (always, even with 0 findings), then **Total recoverable** and **Total approved**, each with its label in the Supplier column, its amount in the Amount column and every other cell empty. Total recoverable is `latestHeadline().recoverableCents` (the Recoverable tile, `recover` findings only, spec 0004 AC-6). Total approved is `reviewTotals(findings).approvedCents` (the Approved tile, spec 0008 AC-1). They always equal the two tiles for the same database state.
- **AC-9**: Workbook layout. The .xlsx has two sheets. **Findings**: the header row in bold, frozen (it stays in view when scrolling), with an autofilter over the header and the finding rows only (not the blank row or the totals; with 0 findings it spans the header row alone); total rows in bold; column widths in characters: Supplier 28, Invoice 14, Check 24, Action 14, Finding 40, Amount (USD) 14, Calculation 48, Evidence 56, Decision 12, Reason 40, Decided at (UTC) 18, with Calculation, Evidence and Reason set to wrap. **Summary**: two columns, label and value, in this order: Audit run finished (UTC) (`finishedAt`, same format as AC-6), Exported at (UTC), Invoices checked (`invoiceCount`, number cell), Invoiced total (`invoicedTotalCents`, money cell), Findings (`findingCount`, number cell), Recoverable (money cell), Approved (money cell), Pending (`"<pending> of <total>"`, as the tile), % of invoiced (`recoverableShare` text, as the tile). Every text value is written as a string cell, never as a formula.
- **AC-10**: File name. `overpayment-findings-<YYYY-MM-DD>.xlsx` or `.csv`, where the date is the export request's UTC date.
- **AC-11**: CSV format. UTF-8 with a byte order mark (so Excel shows `·` and `−` correctly), CRLF line endings, a comma separator, and RFC 4180 quoting: a field containing a comma, a double quote, CR or LF is wrapped in double quotes with inner quotes doubled; other fields are written bare. Formula guard: any text field whose first character is `=`, `+`, `-`, `@`, a tab or CR gets a leading `'`, so a spreadsheet never runs it (a supplier name, filename or reason comes from outside the app). Money fields are generated numbers and are not guarded.
- **AC-12**: One snapshot. The route reads the run, the headline and the findings in one SQLite transaction (like `readReview`), so a Load sample data from another visitor can never land between the rows and the totals. Each request reads fresh, so a decision made a moment ago shows in the next download.
- **AC-13**: Acceptance numbers. On a fresh sample load, both files list 8 findings with NL88310 `8141.00` (Duplicate invoice, Recover, Pending) first and BW-5530 `0.00` (Missing reference, Review only) last; Total recoverable `9766.85`, Total approved `0.00`; the Summary sheet reads Pending `8 of 8` and % of invoiced `18.1%`. After approving the 7 money findings and rejecting BW-5530 with a reason, a new export shows Total approved `9766.85`, BW-5530 as Rejected with that reason, and Pending `0 of 8`.
- **AC-14**: Logging. Every request logs one `export` event through `logEvent`: `{ event: "export", format, outcome, findingCount, ms }`, where `outcome` is `ok`, `bad_format` or `no_run`, `format` is `null` when bad, and `findingCount` is present only when `ok`. Never a supplier, filename, reason or amount.
- **AC-15**: Demo. Export works the same with `DEMO_MODE=true` (the public demo must let a visitor export, scope Feature 14). No new environment variables.
- **AC-16**: Green. `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` and `pnpm design:lint` pass, including the amber source guard (no new file joins `AMBER_ALLOWLIST`).

## Decision

**Chosen option**: Option 1: A route handler that builds the file on each request from the review snapshot

The Export menu links straight to `GET /api/export?format=…`; the route reads the same snapshot the review screen reads, turns it into one table of rows, and writes that table as a .csv (our own RFC 4180 writer) or an .xlsx (`exceljs`). No preview page, no stored files.

**Implementation skills**: `shadcn` (`shadcn-ui/ui`, `.agents/skills/shadcn/`) · `tailwind-v4-shadcn` (`secondsky/claude-skills`, `.agents/skills/tailwind-v4-shadcn/`)

**Design source**: `DESIGN.md` (the app bar paragraph under `## Layout`: Export is secondary, .xlsx and .csv; the menu shadow and menu motion) and [Auditor Wireframes](https://claude.ai/design/p/41c4bab7-232e-4081-8911-fc9e827fd34b?file=Auditor+Wireframes.dc.html) option **1g** (export menu). Wireframe **1h** (claim preview) is not built in this feature (see Follow-up). Where the wireframes and this spec disagree, this spec wins.

**Settled during design** (engineer's picks):
- Total rows: two, Total recoverable and Total approved, matching both tiles.
- Rows: every finding, with a Decision column.
- Export while findings are pending: allowed, pending shows as Pending.
- Claim preview (1h): not now; the menu downloads directly.
- Columns: the full 11 column log (AC-4).
- .xlsx money: number cells with a `$` format, totals as written values.
- .csv money: plain decimal, `8141.00`.
- Evidence: one cell of joined citations.
- .csv totals: after one blank row, at the end.
- Labels: plain words.
- Decided at: UTC, `YYYY-MM-DD HH:MM`.
- File name: `overpayment-findings-<date>`.
- Run context: a second Summary sheet.
- No run: Export disabled with a tooltip, route answers 404.
- .csv encoding: UTF-8 with BOM, CRLF.

**Decided while writing** (my calls):
- **Download by plain link, not a Server Action.** A link with `download` needs no client code, works with the browser's own download handling, and is the route spec 0001 already named. Runner up: a Server Action returning bytes to the client, which needs a Blob and object URL dance for no gain.
- **Formula guard in the .csv only.** exceljs writes strings as string cells, which Excel never evaluates, so the .xlsx needs no guard; a .csv has no types, so every text cell is a possible formula. Runner up: guarding both, which would put stray `'` marks into clean .xlsx text.
- **One row model feeds both writers.** `exportTable(snapshot)` builds header, rows and totals once; the writers only format. This is what keeps the two files identical in content. Runner up: each writer reading `FindingView` itself, which lets them drift.
- **Button order follows `DESIGN.md`**: Load sample data, then Export.
- **No rate limit in the app.** The route is a read of a few kilobytes on a single replica; the public demo sits behind Cloudflare (Feature 14 decides edge limits). Runner up: an in memory limiter, which adds state for a threat this demo does not face yet.
- **Totals from the same functions as the tiles** (`latestHeadline`, `reviewTotals`), never recomputed in the export, so the two can never disagree.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**: no new tables, columns or migration. The export reads what specs 0002, 0004 and 0008 already store and expose:

| Source | Fields used |
|---|---|
| `audit_runs` (latest, via `latestAuditRun`) | `finishedAt`, `invoiceCount`, `invoicedTotalCents`, `recoverableTotalCents`, `findingCount` |
| `listFindings(db)` → `FindingView` | `supplierName`, `invoiceNumber`, `checkId`, `action`, `title`, `amountCents`, `calculation`, `evidence`, `decision` (`status`, `reason`, `decidedAt`) |
| `latestHeadline(db)` | `recoverableCents`, `recoverableShare` |
| `reviewTotals(findings)` | `approvedCents`, `pendingCount`, `findingCount` |

In memory shapes (new, all `readonly`):

```ts
// lib/audit/export.ts
type ExportSnapshot = {
  run: AuditRunRow;            // the latest run
  headline: Headline;          // same object the tiles read
  findings: readonly FindingView[];
  totals: ReviewTotals;
};

// lib/export/table.ts
type ExportFormat = "xlsx" | "csv";          // Zod enum, parses the query
type Cell = { kind: "text"; value: string } | { kind: "money"; cents: number } | { kind: "empty" };
type ExportTable = {
  header: readonly string[];                 // the 11 headers of AC-4
  rows: readonly (readonly Cell[])[];        // one per finding
  totals: readonly (readonly Cell[])[];      // Total recoverable, Total approved
  summary: readonly (readonly [string, Cell])[]; // the Summary sheet pairs of AC-9
};
```

**State transitions**: none. The export only reads. A finding's decision state is whatever `listFindings` reports at request time.

**Code layout**:

```
lib/export/labels.ts     CHECK_LABEL, ACTION_LABEL, DECISION_LABEL (exhaustive Records, AC-5)
lib/export/format.ts     centsToPlain, utcMinute, exportFileName (pure, AC-6, AC-7, AC-10)
lib/export/table.ts      ExportFormat, exportTable(snapshot, now) → ExportTable (pure, AC-4, AC-8, AC-9)
lib/export/csv.ts        toCsv(table) → string: BOM, CRLF, RFC 4180, formula guard (pure, AC-11)
lib/export/xlsx.ts       toXlsx(table) → Promise<Buffer> with exceljs (AC-7, AC-9)
lib/audit/export.ts      readExport(db) → ExportSnapshot | null (one transaction, AC-12);
                         handleExportRequest(request, config) → Response (AC-3, AC-14)
app/api/export/route.ts  thin GET wrapper: getDb, Date.now (like app/api/ingest/route.ts)
components/app-bar.tsx   + canExport prop; renders ExportMenu beside LoadSampleButton
app/(app)/_components/export-menu.tsx   client: DropdownMenu with two download links, disabled state, tooltip
app/(app)/layout.tsx     + reads latestAuditRun(getDb()) !== null for canExport
```

`lib/export/` imports no Next, no DB and no SDK; `exceljs` is its only dependency beyond Zod and the shared schemas, and `citationsFor` comes from `lib/checks/invoice-view.ts` (pure). `lib/audit/export.ts` is the only new file that touches the database, through `lib/db/` functions.

**API surface**:

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `/api/export` | GET | `format`: `xlsx` \| `csv` (query, req) | 200, file body, `Content-Type`, `Content-Disposition: attachment; filename=…`, `Cache-Control: no-store` | public (no accounts, spec 0001) | 400 `format must be xlsx or csv`; 404 `No audit run yet` |

Other methods get Next's automatic 405.

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| Export menu | enabled or disabled | `latestAuditRun(getDb()) !== null`, read in `(app)/layout.tsx` per request |
| route | format | `format` query param, parsed by the `ExportFormat` Zod enum |
| route | file name date | the request time `now` (`Date.now()` in the route, injected for tests), as a UTC date |
| row | Supplier, Invoice | `FindingView.supplierName`, `FindingView.invoiceNumber` (joined in `listFindings`) |
| row | Check, Action | `checkId`, `action` → `CHECK_LABEL`, `ACTION_LABEL` (decided here, AC-5) |
| row | Finding, Calculation | `title`, `calculation` columns, as stored by the checks (spec 0004) |
| row | Amount | `amountCents` column |
| row | Evidence | `citationsFor(finding)` from `evidence` (spec 0008 AC-6) |
| row | Decision | `decision.status` → `DECISION_LABEL` (pending when no decision or a stale amount, `listFindings`) |
| row | Reason | `decision.reason` when rejected, else blank |
| row | Decided at | `decision.decidedAt` (epoch ms) formatted as UTC `YYYY-MM-DD HH:MM`; blank when pending |
| totals | Total recoverable | `latestHeadline(db).recoverableCents` (= `audit_runs.recoverable_total_cents`, the Recoverable tile) |
| totals | Total approved | `reviewTotals(findings).approvedCents` (the Approved tile) |
| Summary | Audit run finished | `audit_runs.finished_at` of the latest run, UTC |
| Summary | Exported at | the request time `now`, UTC |
| Summary | Invoices checked, Invoiced total, Findings | `audit_runs.invoice_count`, `invoiced_total_cents`, `finding_count` |
| Summary | Recoverable, % of invoiced | `latestHeadline(db).recoverableCents`, `.recoverableShare` |
| Summary | Approved, Pending | `reviewTotals(findings).approvedCents`, `"<pendingCount> of <findingCount>"` |
| log | `export` event fields | format, outcome and row count from the handler; `ms` from the injected clock |

**Key invariants**:
- Total approved equals the Approved tile and Total recoverable equals the Recoverable tile for the same database state (same functions, one snapshot).
- Total approved ≤ Total recoverable (both sum `recover` findings only; approved is a subset).
- The .xlsx and .csv hold the same rows, in the same order, with the same text; only the money representation differs (AC-7).
- Money is integer cents until the last step: the .csv string is built from `Math.trunc(cents / 100)` and `cents % 100` padded, and the .xlsx cell value is `cents / 100` (exact for two decimal amounts in a double, and formatted by Excel).
- Header texts, label texts and column order are constants, never derived from data.
- `lib/export/` stays pure except `xlsx.ts`'s use of exceljs, which does no I/O (it writes to a buffer).

**Security model**: the app has no accounts (spec 0001), so `/api/export` is public like `/review`; in the demo every visitor sees the one shared audit, which is the same data the review screen already shows. The route only reads. It trusts nothing from the query beyond the Zod parsed `format`. Text that came from outside the app (supplier names and invoice numbers read by the model, uploaded filenames, analyst reasons) is guarded against spreadsheet formula injection in the .csv (AC-11) and written as plain string cells in the .xlsx. `Cache-Control: no-store` keeps a proxy or the Cloudflare edge from serving one visitor's snapshot to another later. Error bodies and logs carry no document content (AGENTS.md). No regulated data: the sample is fictional (the brief).

**Configuration required**: none. No new environment variables; `DEMO_MODE` does not change the export. New dependency: `exceljs` (pinned in `package.json`, fixed by the brief and spec 0001).

**Critical test scenarios** (each maps to an acceptance criterion):
- Happy path: in memory SQLite with `seedBriefSample`, run the checks, then `handleExportRequest` for csv and xlsx; parse the csv, and read the xlsx back with exceljs; both show 8 rows in order, the 11 headers, totals `9766.85` and `0.00`, Summary `8 of 8` and `18.1%`, verifies **AC-4**, **AC-8**, **AC-9**, **AC-13**
- Decisions: approve the 7 money findings, reject BW-5530 with a reason containing a comma, a quote and a newline; export again; Total approved `9766.85`, BW-5530 Rejected with the reason quoted correctly in the csv and intact in the xlsx, Decided at in UTC, verifies **AC-6**, **AC-8**, **AC-11**, **AC-13**
- Formula guard: a supplier name `=HYPERLINK("x")` and a reason `-1+1` come out as `'=HYPERLINK(""x"")` (quoted) and `'-1+1` in the csv, and as plain string cells in the xlsx, verifies **AC-11**
- Failure case: `format=pdf`, `format=XLSX` and a missing format → 400 with the fixed text and `text/plain; charset=utf-8`; an empty database → 404 `No audit run yet`; each logs one `export` event with the right outcome and no content, verifies **AC-3**, **AC-14**
- Snapshot: totals and rows come from one `readExport` call inside one transaction (a unit test that the function reads through `db.transaction`), verifies **AC-12**
- Money edge: amounts of `0`, `5`, `100` and `814100` cents render `0.00`, `0.05`, `1.00`, `8141.00` in the csv and the equal numbers in the xlsx, verifies **AC-7**
- Zero findings, not no run: a run saved with 0 findings answers `200` with the header, the blank row and two `0.00` total rows (never the 404), while an empty database answers `404`, verifies **AC-3**, **AC-4**, **AC-8**
- UI: with no run the Export button is disabled and the tooltip reads "Load sample data first" on hover and focus; after Load sample data the menu opens by keyboard and both items download files named `overpayment-findings-<today>.*`, verifies **AC-1**, **AC-2**, **AC-10** (confirmed by `/check verify`)
- Auth/permission: none to deny (no accounts); a POST gets 405 from Next, verifies **AC-3**

## Build plan

Skateboard: the first slice is a complete, usable export (menu, route, a real .csv with totals) end to end; the .xlsx and the edges grow it.

1. [x] Pure pieces with tests first: `lib/export/labels.ts`, `format.ts` (`centsToPlain`, `utcMinute`, `exportFileName`), `table.ts` (`exportTable` from a snapshot built from fixture findings), `csv.ts` (`toCsv` with BOM, CRLF, RFC 4180 quoting and the formula guard). Satisfies **AC-4**, **AC-5**, **AC-6**, **AC-7**, **AC-8**, **AC-10**, **AC-11**.
2. [x] Thin whole (csv end to end): `readExport` in one transaction and `handleExportRequest` in `lib/audit/export.ts`, with tests on in memory SQLite and `seedBriefSample`; `app/api/export/route.ts`; `export-menu.tsx` with both items linking to the route (only csv works yet), wired into `AppBar` through `canExport` from the layout. Satisfies **AC-1**, **AC-3**, **AC-12**, **AC-13** (csv).
3. [x] Excel: `pnpm add exceljs` (pinned); `lib/export/xlsx.ts` with the Findings sheet (bold frozen header, autofilter over findings only, widths, wrap, money format, bold totals) and the Summary sheet; round trip test reading the buffer back with exceljs; route serves xlsx. Satisfies **AC-7**, **AC-8**, **AC-9**, **AC-13** (xlsx).
4. [x] Edges and polish: disabled Export with the focusable tooltip wrapper when no run; 400 and 404 paths; the `export` log event; confirm `DEMO_MODE=true` exports; then the full green pass (typecheck, lint, test, build, design lint, amber guard). Satisfies **AC-2**, **AC-3**, **AC-14**, **AC-15**, **AC-16**.

## Consequences

**Positive**:
- Closes the brief's loop ("Approve / Reject works and the export reflects the decisions") with no new storage.
- One row model means the two formats cannot disagree, and totals come from the same functions as the tiles, so the file always reconciles to the screen.
- Settles the total row clash between specs 0004 and 0008 in one place.
- A plain link download works with no client JavaScript beyond the menu, and in every browser.

**Negative / tradeoffs**:
- No claim preview: the analyst sees the file only after opening it. Wireframe 1h waits.
- `exceljs` is a sizeable dependency (and its own transitive packages) for one route; it only loads on the server, but it grows the Docker image.
- The .csv's two total rows and blank line make it slightly less clean for scripts, which must stop at the first blank row.
- Totals are written values, so an analyst who edits a cell in Excel sees totals that no longer add up.
- In the public demo every visitor exports the one shared audit, including other visitors' decisions (the same limit spec 0008 accepted).

**Neutral**:
- `components/app-bar.tsx` gains a `canExport` prop, and `(app)/layout.tsx` reads the latest run per request (one more tiny query beside `countDecisions`).
- Adds a new log event name, `export`.

## Follow-up

- [ ] Deferred: claim preview page (wireframe 1h), a screen showing the claim table and totals with the two downloads.
- [ ] Deferred: an approved only claim sheet (recover findings the analyst approved), if a real client wants a file to send a supplier as is.
- [ ] Feature 14: decide whether the Cloudflare edge rate limits `/api/export` along with the rest of the public demo.
- [ ] Spec 0004's follow-up ("the total row sums `recover` findings only") and spec 0008's follow-up ("the total row equals the Approved tile") are both met by AC-8's two rows; `/sync` can tick them once this ships.
