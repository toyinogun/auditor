# 0003. Sample data generator for the brief's fictional documents

**Date**: 2026-09-27
**Status**: Proposed

## Summary

This spec designs the script that turns the brief's fictional world into real files: 12 PDFs (2 contracts, 4 purchase orders, 6 invoices), `receipts.csv`, `ap_payments.csv`, and a `manifest.json` that lists them. It renders straight from the fixture that already holds every figure (`lib/schemas/fixtures/brief-sample.ts`), so the PDFs, offline mode and the tests can never disagree. The NL88310 reminder comes out as an image only scan (a picture of the page with no text layer), and every file is byte identical on every run, guarded by a test. The output is committed to `public/sample/`, so the demo can serve it and later features can load it.

## Requirements

**User stories**:
- As the portfolio demo, I want real looking supplier documents a visitor can open, so that the audit reads as a real product, not a test harness.
- As extraction (feature 7), I want text PDFs that print every value the fixture holds, plus one scanned invoice with no text layer, so that a real run can be compared one to one against offline mode.
- As offline mode and ingest (features 6 and 8), I want a manifest with each file's sha256, size, kind and text layer flag, so that they can insert documents and limit demo uploads to the sample files without hashing anything themselves.
- As the developer, I want the same bytes on every run, so that regenerating shows no git diff and sha256 dedupe keeps working.

**Acceptance criteria**:
- **AC-1**: `pnpm generate:sample` replaces `public/sample/` with exactly 15 files: the 12 PDFs named in *Feature design*, `receipts.csv`, `ap_payments.csv` and `manifest.json`. The new set is built in a temporary folder and swapped in only when every file succeeded; a file from an older run never survives, and a failed run leaves the previous folder untouched.
- **AC-2**: Every printed figure comes from `BRIEF_SAMPLE`. Before rendering anything, each fixture document parses with its extraction schema and converts with its `to*Record` converter (the arithmetic guard from spec 0002), and each CSV row converts with `toReceiptRecord` or `toPaymentRecord`. Any failure stops the run with a reason naming the file (and line or row), writes nothing, and exits with a non zero code.
- **AC-3**: For each of the 11 text PDFs, the text read back with `unpdf` contains every value of its fixture entry in printed form: document number, supplier name, dates, `Currency: USD`, PO number (when present), and for each line its SKU, description, quantity and unit price, plus line amounts, each charge label and amount, subtotal and total on invoices. Contracts print every price with its schedule item, and each clause reference the fixture holds. The test collapses all whitespace runs to one space in both the read back text and the expected value before matching.
- **AC-4**: `NL88310.pdf` is a single page whose only content is one image: `unpdf` reads no text from it (empty or whitespace only). The image shows the same layout and figures as NL-88310 with its own number (`NL88310`) and date, a stamp reading `REMINDER - payment overdue`, a light scan look (slight tilt, off white paper, faint speckle), and the fictional footer. The file is under 2 MB.
- **AC-5**: Contract C-2026-014 prints Schedule A items 1 to 5, a Section 4.2 with the `included` freight sentence, and a Section 5.1 with the permitted surcharge sentence for fuel at 2.5%. Contract C-2026-022 prints Schedule A items 1 to 3, a Section 6.1 with the no surcharges sentence, and no freight wording anywhere (the word "freight" does not appear). The sentences are the ones pinned in *Clause wording*; the test checks the section heading plus the key pieces (`Section 5.1`, `fuel`, `2.5%`; `Section 4.2`, `Freight shall not be invoiced separately`; `Section 6.1`, `No surcharges`).
- **AC-6**: `receipts.csv` has the header `po_number,sku,quantity_received,received_date` and `ap_payments.csv` has `invoice_number,supplier,amount,paid_date,reference`, each followed by one row per fixture row in fixture order. Parsing each file back and converting row N with `rowNo` N gives records equal to converting the fixture rows directly.
- **AC-7**: Output is byte identical on every run. A test renders the full set in memory twice and gets the same bytes, and compares the sha256 of every rendered file with the committed file in `public/sample/`, failing with the names of the files that drifted.
- **AC-8**: `manifest.json` validates against `SampleManifest` and lists the 14 data files sorted by filename, each with the correct `kind`, `mimeType`, `sha256` and `sizeBytes` of the file on disk, and `hasTextLayer` (`true` for the 11 text PDFs, `false` for `NL88310.pdf`, `null` for the CSVs). It holds no timestamp.
- **AC-9**: Every page of every PDF carries the footer `Fictional sample document · Overpayment Auditor demo`. Every invoice prints `Terms: Net 30` and a due date 30 days after its invoice date (NL-88310 prints a due date of May 3, 2026).

## Decision

**Chosen option**: Option 1: Render committed files from the fixture with pdfkit, and draw the scan with @napi-rs/canvas from the same page layout.

A `scripts/generate-sample/` script, run with `tsx`, validates `BRIEF_SAMPLE`, lays each document out as a list of simple drawing operations, paints text PDFs with pdfkit and the NL88310 scan with @napi-rs/canvas (placed as one image on a pdfkit page), writes the CSVs and the manifest, and swaps the result into `public/sample/`, which is committed to git.

**Implementation skills**: `testing-patterns` (user skill, `~/.claude/skills/testing-patterns/`) for the Vitest tests. No Agent Skills exist for pdfkit, @napi-rs/canvas, tsx or unpdf.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

### Code layout

```
scripts/generate-sample/
  index.ts            CLI entry: validate, render, write to a temp folder, swap into public/sample/, print a summary
  validate.ts         checks BRIEF_SAMPLE with the extraction schemas and to*Record converters (pure)
  parties.ts          the printed extras: letterheads, addresses, bill to, contacts, clause wording, stamp text
  format.ts           printed forms: long dates, money, quantities, due date (pure)
  layout/             one pure function per document type: fixture entry + parties → Page (drawing operations)
  paint-pdf.ts        Page → PDF bytes with pdfkit (text PDFs)
  paint-canvas.ts     Page → PNG bytes with @napi-rs/canvas, plus the seeded scan effects
  scan.ts             PNG → one page image only PDF with pdfkit
  csv.ts              fixture rows → CSV text (pure)
  manifest.ts         files → SampleManifest (pure)
  render.ts           renderSample(): every output file as { filename, bytes } in memory, no disk writes
  fonts/              Inter-Regular.ttf, Inter-Bold.ttf, OFL.txt (committed)
  *.test.ts           tests beside the source
lib/schemas/sample-manifest.ts   SampleManifest Zod schema (app code reads it; it never imports from scripts/)
public/sample/                   the committed output
```

`lib/schemas/fixtures/brief-sample.ts` stays exactly as it is: it is the structured copy that offline mode (feature 6) imports. No JSON sidecar files are written.

### Data model sketch

No database tables change. The feature adds one shared shape, `SampleManifest`, in `lib/schemas/sample-manifest.ts`:

| Field | Type | Rule |
|---|---|---|
| `files` | array of `SampleManifestEntry` | exactly 14 entries, sorted by `filename`, `filename` unique |
| `filename` | string | as written in `public/sample/` |
| `kind` | `DocumentKind` (existing enum) | `contract`, `purchase_order`, `invoice`, `receipts_csv`, `payments_csv` |
| `mimeType` | `"application/pdf"` or `"text/csv"` | matches the extension |
| `sha256` | string | 64 lowercase hex characters, of the exact file bytes |
| `sizeBytes` | integer | greater than 0 |
| `hasTextLayer` | boolean or null | null for CSVs, `false` only for `NL88310.pdf` |

The fields map straight onto `insertDocument` (`sha256`, `filename`, `mime_type`, `size_bytes`) and `documents.has_text_layer` from spec 0002.

**Output files** (all in `public/sample/`):

| File | Kind | Pages | Text layer |
|---|---|---|---|
| `C-2026-014.pdf`, `C-2026-022.pdf` | contract | 1 or 2 | yes |
| `PO-4501.pdf`, `PO-4502.pdf`, `PO-4503.pdf`, `PO-4504.pdf` | purchase_order | 1 | yes |
| `NL-88121.pdf`, `NL-88203.pdf`, `NL-88310.pdf`, `BW-5521.pdf`, `BW-5530.pdf` | invoice | 1 | yes |
| `NL88310.pdf` | invoice | 1 | no (scan) |
| `receipts.csv`, `ap_payments.csv` | receipts_csv, payments_csv | | |
| `manifest.json` | (not listed in itself) | | |

### Page model and painters

Every document is laid out once as a `Page`: a readonly list of drawing operations in PDF points (1/72 inch) on a US Letter page (612 × 792): `text` (x, y, string, font weight, size, alignment, width), `rule` (a line), `box` (a rectangle, optionally filled), and `stamp` (rotated outlined text). Layout functions are pure and take a `measure(text, weight, size)` function so they can wrap contract paragraphs; the pdfkit painter supplies it from the embedded font. Two painters consume the same `Page`: pdfkit for text PDFs, and canvas for the scan, so NL88310 looks exactly like NL-88310 except for its number, date and stamp.

**What each document prints** (figures from the fixture, everything else from `parties.ts`):
- **All**: supplier letterhead (name, fictional address, phone in the 555 01xx range, email on `example.com`), document title and number, `Currency: USD` (from the fixture `currency`), the footer on every page. A label and its value are drawn as one text operation with a literal space (`Total $8,141.00`), never as two adjacent operations, so the read back cannot merge them.
- **Invoice**: invoice number, invoice date, `Terms: Net 30`, due date, PO number (the line is omitted when the fixture has none), bill to Halvorsen Components Inc., currency `USD`, a line table (SKU, description, quantity, unit price, amount), charge rows (fixture label and amount), subtotal, total, remit to details.
- **Purchase order**: PO number, order date, buyer Halvorsen Components Inc. as issuer, supplier as vendor, a line table (SKU, description, quantity, unit price, line total), PO total, ship to address.
- **Contract**: contract number, parties, term (start and end dates), Schedule A price table with item numbers, then numbered sections. The section numbers and headings come from the fixture's `freightClause` and `surchargeClause`; their body wording comes from `parties.ts`. A contract whose `freightClause` is null prints no freight wording at all.
**Clause wording** (in `parties.ts`, chosen by the fixture values, never per contract by hand; `{cap}` is `formatBps(parseRate(capRate))`):
- `freightTerms: "included"`: "Prices include delivery to Buyer's facility. Freight shall not be invoiced separately."
- `freightTerms: "billable"`: "Freight is billable at cost and shown as a separate invoice line."
- `freightTerms: "not_stated"`: no freight section and no freight wording.
- `surcharges` not empty: one sentence per entry, "Supplier may apply a {type} surcharge not exceeding {cap} of the goods subtotal." (without a cap: "Supplier may apply a {type} surcharge."), then "No other surcharges are permitted."
- `surcharges` empty: "No surcharges are permitted."
- Each sentence group sits under its fixture clause heading (`Section 4.2`, `Section 5.1`, `Section 6.1`). Headings and figures such as `2.5%` never wrap onto a new line.

- **NL88310 scan**: the NL-88310 layout with the fixture's number and date, plus a red rotated stamp `REMINDER - payment overdue`.

**Scan effects** (all from a seeded pseudo random generator, mulberry32 with a fixed seed constant, never `Math.random`): render at 200 DPI (1700 × 2200 pixels) in grayscale, off white paper tone, rotate the content about 0.4 degrees, add sparse faint speckle. Encode as PNG, place it filling one Letter page in a pdfkit document that draws no text.

### API surface

No HTTP routes and no Server Actions. The surface is one command and a few module functions.

| Entry | Kind | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `pnpm generate:sample` | CLI (`tsx scripts/generate-sample/index.ts`) | none | writes into `public/.sample.tmp/` (same disk, so the rename cannot fail with `EXDEV`), then removes `public/sample/` and renames the temp folder into place; prints one line per file (name, size) and a total | local developer only | fixture invalid (AC-2), font file missing, write or rename failure: non zero exit, previous folder kept |
| `validateSample(sample)` | `validate.ts` | `BRIEF_SAMPLE` | `Result<void>` | none (pure) | reason names the file and line or row; converters get `{ documentId: 0, filename }` since no database row exists yet |
| `renderSample()` | `render.ts` | none (reads the fixture and the committed fonts) | `Result<readonly { filename, bytes }[]>` for all 15 files | none | same as `validateSample` |
| `toCsv(header, rows)` | `csv.ts` | header, rows of strings | CSV text | none (pure) | none |
| `buildManifest(files)` | `manifest.ts` | rendered files | `SampleManifest` | none (pure) | none |
| `SampleManifest` | `lib/schemas/sample-manifest.ts` | JSON | parsed manifest | none (pure) | invalid shape |

### Value sourcing

| Action | Value produced or printed | Source |
|---|---|---|
| layout | document numbers, supplier names, dates, SKUs, descriptions, quantities, unit prices, line amounts, charge labels and amounts, subtotal, total, PO numbers, clause references | `BRIEF_SAMPLE` fixture fields, copied as they are |
| layout | printed money, e.g. `$15,600.50` | `formatCents(parseMoney(fixture string))`; never a float |
| layout | printed quantities, e.g. `2,000` | the fixture integer with en US grouping |
| layout | printed dates, e.g. `April 3, 2026` | the fixture `YYYY-MM-DD` string, formatted in UTC by `format.ts` |
| layout (invoice) | due date | invoice date + 30 days, date arithmetic in UTC in `format.ts` |
| layout (PO) | line totals and PO total | `quantity × parseMoney(unitPrice)` in cents, summed in cents; display only, no check reads them |
| layout (contract) | Schedule A item numbers | the fixture price `clause` (`Schedule A, item N`) |
| layout (contract) | section numbers and headings | the fixture `freightClause` and `surchargeClause` |
| layout (contract) | section body wording, e.g. fuel cap text | `parties.ts` per contract number; the cap figure comes from the fixture `capRate` |
| layout | letterheads, addresses, contacts, bill to, ship to, remit to, terms text | `parties.ts` (generator only, never in the fixture) |
| layout (scan) | stamp text | `parties.ts`, the brief's exact words `REMINDER - payment overdue` |
| every PDF | footer text | constant in `parties.ts` |
| pdfkit | `CreationDate`, `ModDate` | the document's own date (invoice date, order date, or contract start) at 12:00 UTC |
| pdfkit | `Title`, `Author` | document number, supplier name |
| pdfkit | file ID | derived by pdfkit from the fixed info dates, so it is stable |
| canvas | scan noise, speckle positions, tilt | mulberry32 seeded with a fixed constant in `paint-canvas.ts` |
| CSV | cell values and row order | the fixture `receipts` and `payments` rows, in order |
| manifest | `sha256`, `sizeBytes` | computed from the rendered bytes with `node:crypto` |
| manifest | `kind`, `mimeType`, `hasTextLayer` | fixed by output file type; `hasTextLayer` is false only for the scan |
| manifest | file bytes | `JSON.stringify(manifest, null, 2) + "\n"`, keys in schema order (`filename`, `kind`, `mimeType`, `sha256`, `sizeBytes`, `hasTextLayer`) |
| validate | `documentId` for the converters | the constant `0` (validation happens before any database row exists) |
| every document | `Currency: USD` line | the fixture `currency` field |

### Key invariants

- The fixture is the only source of figures. The generator never edits it and never hardcodes a figure the fixture holds.
- No money is computed as a float; only `parseMoney`, cents arithmetic and `formatCents` touch money.
- Nothing in the output depends on the clock, the machine's locale or timezone, or `Math.random`: dates format in UTC, number grouping is fixed to en US, the PDF info dates are fixed, randomness is seeded.
- `NL88310.pdf` contains no text drawing operations at all, so its only content is the image.
- `public/sample/` is only ever replaced whole, never partly written. The temp folder `public/.sample.tmp/` is gitignored and removed at the start of each run.
- CSVs are UTF 8 without a byte order mark, LF line endings, a trailing newline after the last row, and RFC 4180 quoting only when a cell holds a comma, quote or newline.
- Documents render one after another, never in parallel (the canvas font registry and pdfkit font embedding are not checked for concurrent use).
- `scripts/generate-sample/` imports `lib/schemas/` with relative paths, not the `@/` alias, so `tsx` and Vitest resolve it the same way.
- `lib/schemas/` stays pure; only `scripts/generate-sample/` imports pdfkit or @napi-rs/canvas. App code never imports from `scripts/`.

### Security model

Everything is fictional and public by design: `public/sample/` is served to anyone who visits the demo. No secrets, no environment variables, no network calls. `parties.ts` uses invented addresses, 555 01xx phone numbers and `example.com` emails so no real business or person is named, and the footer marks every page as fictional. The script runs only on a developer machine; it is never part of the Docker image's runtime.

### Configuration required

None. No new environment variables. The output path `public/sample/` is a constant in `index.ts`.

New packages: `pdfkit`, `@types/pdfkit`, `@napi-rs/canvas` and `tsx` as dev dependencies; `unpdf` as a regular dependency (feature 7 uses it at runtime; this feature uses it in tests). Install the latest stable versions and commit the lockfile.

### Critical test scenarios

- Happy path: `renderSample()` returns 15 files; every text PDF reads back with every fixture value in printed form, verifies **AC-1**, **AC-3**, **AC-5**, **AC-9**.
- Scan: `unpdf` reads no text from `NL88310.pdf`, it is under 2 MB, and the manifest flags it `hasTextLayer: false`, verifies **AC-4**, **AC-8**.
- Guard: a copy of the fixture with NL-88310's unit price changed to `"5.01"` makes `validateSample` fail naming `NL-88310.pdf` and line 1, and nothing is rendered, verifies **AC-2**.
- CSV round trip: parse both CSVs and convert each row with its `rowNo`; the records equal the fixture's converted records, verifies **AC-6**.
- Determinism and drift: two in memory renders are byte equal, and their sha256 values equal the committed files, verifies **AC-7**.
- Atomic swap: when rendering fails, `public/sample/` (or a temp stand in) is unchanged, verifies **AC-1**.
- Auth/permission: not applicable (no accounts, no endpoint; the output is intentionally public).

## Build plan

Skateboard: first a thin generator that already writes a complete, usable folder (CSVs, the text invoices, the manifest) end to end, then grow it with the other document types, then the scan, then lock the bytes down.

1. Install `pdfkit`, `@types/pdfkit`, `@napi-rs/canvas`, `tsx` (dev) and `unpdf`; add `"generate:sample": "tsx scripts/generate-sample/index.ts"` to `package.json`; commit Inter Regular and Bold static TTFs with `OFL.txt` in `scripts/generate-sample/fonts/`; add `lib/schemas/sample-manifest.ts` with its test, satisfies **AC-8**.
2. `validate.ts` with tests: run every fixture document through its extraction schema and converter and every CSV row through its converter, failing with a named reason, satisfies **AC-2**.
3. The thin whole: `format.ts`, `parties.ts`, the page model, `paint-pdf.ts` with fixed info dates, the invoice layout for the 5 text invoices with footer and Net 30 terms, `csv.ts`, `manifest.ts`, `render.ts`, and `index.ts` with the temp folder swap and summary (add `public/.sample.tmp/` to `.gitignore`). Before building the other invoices, read back one real invoice with `unpdf` to confirm a label and value pair comes out as one run, and render it twice to confirm identical bytes (this catches a changing font subset name early). Then read back tests for the invoices, an in memory render twice equality test, and CSV round trip tests, satisfies **AC-1**, **AC-3**, **AC-6**, **AC-7**, **AC-8**, **AC-9**.
4. Purchase order and contract layouts, with contract paragraph wrapping through `measure` and the clause sections from *Clause wording*; read back tests, satisfies **AC-3**, **AC-5**, **AC-9**.
5. `paint-canvas.ts` and `scan.ts`: paint the NL88310 page with the bundled font, the stamp and the seeded scan effects, wrap the PNG in an image only PDF; tests for no text layer and manifest flag, and measure the file against the 2 MB budget while tuning the speckle density, satisfies **AC-4**, **AC-8**.
6. Run `pnpm generate:sample`, open every PDF once by eye, commit `public/sample/`, and add the drift test comparing the sha256 of every rendered file, the scan included, with the committed files, satisfies **AC-1**, **AC-7**.

## Consequences

**Positive**:
- One source of figures: the PDFs, offline mode and the checks' tests all read `BRIEF_SAMPLE`, so a figure cannot differ between them.
- Committed, byte stable files mean sha256 dedupe works across upload, n8n and "Load sample data", and a demo upload allowlist can be a plain list of hashes.
- Visitors can open the real PDFs straight from the demo, which makes the portfolio story concrete.
- The Docker image needs none of the PDF tooling; it only copies `public/`.

**Negative / tradeoffs**:
- Byte identity depends on the exact versions of pdfkit, @napi-rs/canvas, the font files and Node's zlib. Upgrading any of them can change bytes; the drift test catches it, and you regenerate and commit. Stored sample documents from before the change then no longer dedupe against the new files (a reset clears them).
- The scan's PNG is rendered by Skia. It is stable on one machine, but pixels may differ slightly on another OS or CPU. Day one compares the scan byte for byte (one dev machine, no CI). If the drift test ever fails only on another platform, relax the scan comparison to decoded pixels with a small tolerance rather than chasing identical bytes.
- Binary files in git: about 15 files, a few MB, rewritten whole on each regeneration.
- The page model is a small drawing abstraction you own (text, rule, box, stamp). It is less flexible than a real layout engine; long contract paragraphs rely on the `measure` based wrapping.
- A native prebuilt package (@napi-rs/canvas) enters dev dependencies. It ships prebuilt binaries for macOS and Linux on arm64 and x64, but an unusual platform would need a build.

**Neutral**:
- `unpdf` arrives now instead of in feature 7.
- Printed dates (`April 3, 2026`) and grouped money (`$15,600.50`) differ from the fixture's text; the extraction schema already asks the model to return `YYYY-MM-DD` and bare decimals, so feature 7 must normalize, which is exactly the realistic test.

## Follow-up

- [ ] Feature 6 (offline audit run): read `public/sample/manifest.json` with `SampleManifest` to insert each document with `source: "sample"` and its sha256, size, mime type and `hasTextLayer`, and pair each file with its fixture entry by `filename`.
- [ ] Feature 8 (upload and ingest): with `DEMO_MODE=true`, accept only files whose sha256 appears in the manifest.
- [ ] Feature 7 (extraction): confirm a real run on `NL88310.pdf` (scan) returns the same fields as the fixture, and that printed dates and money normalize to the extraction formats.
- [ ] `AGENTS.md` (for `/sync`): note `pnpm generate:sample` under Commands, `public/sample/` as generated output that is never edited by hand, and add to `Declined:` the pdfkit MCP servers (`linzhiqin2003/PDFKit`, `ivarvd-hldng/pdf-generator-mcp-server`, `aviddiviner/mcp-pdfkit`) so they are not offered again.
- [ ] ESLint and Prettier: make sure `public/sample/` (binary and generated) is ignored by `format` and `lint`.
