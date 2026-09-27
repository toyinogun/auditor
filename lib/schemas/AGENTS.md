# lib/schemas

The shared shapes every feature uses. Pure: no Next, DB, SDK or `fetch` imports. Governing spec: [0002 data model](../../docs/specs/0002-data-model/index.md).

## Files

- `extraction.ts`: what a document prints, numbers kept as text. One shape per document type (invoice, contract, purchase order) plus the two CSV rows. These double as the Claude tool input and the offline JSON. The CSV parsers that produce those rows live in `lib/ingest/csv.ts`.
- `records.ts`: domain records in integer cents with their locators (`documentId`, `filename`, `lineNo`, `rowNo`), and `AuditInput`, what the checks read.
- `convert.ts`: `to<Type>Record` maps extraction to record and enforces the arithmetic guard (lines, subtotal, rated charges, total).
- `finding.ts`: `Finding` with its evidence, and `DecisionInput`.
- `money.ts`, `keys.ts`, `dates.ts`, `enums.ts`, `result.ts`: helpers.
- `fixtures/brief-sample.ts`: the brief's sample data. Never change a figure to make a test pass.
- `fixtures/brief-sample-records.ts`: `briefSampleRecords(refFor?)`, the sample converted to an `AuditInput` (documents numbered 1 to 14 in fixture order by default), for tests with no database and the offline audit run. `BRIEF_SAMPLE_FILENAMES` is that fixture order.
- `sample-manifest.ts`: `SampleManifest`, the shape of `public/sample/manifest.json` (sha256, size, kind and text layer flag for each sample file). App code reads the manifest with it, never by importing from `scripts/`.

## Conventions

- Money is integer cents, rates are integer basis points (250 means 2.5%). Turn text into numbers only with `parseMoney` and `parseRate`; compute a percent only with `percentOfCents` (rounds half away from zero). Never use a float for money.
- Converters return `Result` (`ok` / `err` from `result.ts`) with a reason that names the field, line (`line N`) or row (`row N`). They throw only for bugs.
- Where a failed `Result` can only mean a bug (a committed fixture or sample), unwrap it with `orThrow(context, result)` from `result.ts` rather than a local helper.
- `lineNo` is the array position from 1. `rowNo` is passed by the caller, counting data rows from 1 with the header excluded.
- Suppliers match by `normalizeSupplierKey` (drops legal suffixes like Inc., LLC, Co.). Decisions attach to `findingKey`, so keep its parts stable.
- Only USD is accepted. Quantities are positive whole numbers.

_Drafted by /sync from the introducing change, worth a quick human pass._
