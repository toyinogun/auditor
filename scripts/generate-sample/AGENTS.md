# scripts/generate-sample

The sample data generator: `pnpm generate:sample` turns `BRIEF_SAMPLE` (`lib/schemas/fixtures/brief-sample.ts`) into the 12 PDFs, `receipts.csv`, `ap_payments.csv` and `manifest.json` in `public/sample/`. Governing spec: [0003 sample data generator](../../docs/specs/0003-sample-data-generator/index.md).

## Files

- `index.ts`: the CLI entry. `write.ts` renders into `public/.sample.tmp/` and swaps it into `public/sample/` only when every file succeeded.
- `validate.ts`: runs every fixture document and CSV row through the `lib/schemas` converters before anything renders; errors name the file and line or row.
- `render.ts`: `renderSample()` returns all 15 files in memory, with no disk writes (the tests use it).
- `layout/`: one pure function per document type, fixture entry to a `Page` of drawing operations (`layout/page.ts`). `layout/common.ts` holds the shared blocks (letterhead, table, footer, word wrap, page flow).
- `paint-pdf.ts`: `Page` to text PDF with pdfkit. `paint-canvas.ts` + `scan.ts`: the NL88310 image only scan (canvas PNG on a pdfkit page that draws no text).
- `parties.ts`: everything printed that the fixture does not hold (letterheads, buyer, clause wording, footer, stamp). `format.ts`: printed dates, money, quantities, due dates.
- `csv.ts`, `manifest.ts`: CSV text and the manifest (schema in `lib/schemas/sample-manifest.ts`).
- `fonts/`: the committed Inter TTFs and their OFL license. Both painters use them.

## Conventions

- Every figure comes from the fixture. Never hardcode one here, and never change the fixture to fit the output. Money goes through `parseMoney` and `formatCents`, never a float.
- Output must be byte identical on every run: no clock, locale, timezone or `Math.random`. Dates are handled in UTC, PDF info dates are fixed to the document's own date, and the scan's noise uses seeded `mulberry32`.
- A label and its value are one text op (`Total $8,141.00`) so a text read back keeps them together.
- Documents render one after another, never in parallel.
- Import `lib/` with relative paths, not `@/`, so `tsx` and Vitest resolve them the same way. App code never imports from `scripts/`.
- `public/sample/` is generated: never edit it by hand. After changing the generator, a dependency (pdfkit, @napi-rs/canvas) or the fonts, run `pnpm generate:sample` and commit the output. The drift test in `render.test.ts` fails otherwise.

_Drafted by /sync from the introducing change, worth a quick human pass._
