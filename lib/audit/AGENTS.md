# lib/audit

Loads records, runs the checks and stores the findings (spec 0001 layout). The glue between `lib/db/` and the pure `lib/checks/`; it holds no audit logic of its own. Pipeline from [0004 six audit checks](../../docs/specs/0004-six-audit-checks/index.md); clean start from [0002 data model](../../docs/specs/0002-data-model/index.md).

## Files

- `run.ts`: `runAudit(db, clock)` runs `runChecks(loadAuditInput(db))` over whatever is stored, saves it with `saveAuditRun` (replacing earlier findings, keeping decisions) and returns `{ runId, summary }`.
- `sample.ts`: `runSampleAudit(db, clock, manifest)`, the offline audit and what "Load sample data" calls. In one transaction: `resetAll`, store the 14 sample documents with the real hashes from `public/sample/manifest.json`, save the fixture records via `briefSampleRecords`, then `runAudit`. A rerun replaces everything, decisions included; a throw rolls it all back.
- `loadSample(db, files, clock, manifest)` in `sample.ts` runs `runSampleAudit`, then empties the uploads folder (spec 0006, AC-14).
- `loadSampleData(db, files, clock, manifest)` in `sample.ts` is the same steps for the app bar's Load sample data (spec 0007, AC-12), returning `Result`. Only a failed audit is an error; once the run commits, a failed clear is logged as `uploadsCleared: false`, not returned.
- `scripts/audit-sample/index.ts` exposes `loadSample` as `pnpm audit:sample` against `$DATA_DIR/auditor.db`.
- `store.ts`: the storage steps both runs share: `storeManifestDocuments` (manifest order, so document ids match), `trySaveAuditInput` (returns the first refused save as a value) and `saveAuditInput` (throws it). `saveDocumentRecords` stores one ingested document's records and marks it `done` in one transaction; a refused save comes back as `err` with a plain reason, never the driver's message (it lands in `documents.error` and the webhook answer).
- `headline.ts`: `latestHeadline(db)` and `headlineText`, the `N findings, $X recoverable of $Y invoiced (Z%)` line the upload panel and webhook show (spec 0006).
- `live.ts`: `runLiveAudit(db, manifest, deps)`, the live run (spec 0005). Extracts the PDFs 4 at a time, parses both CSVs, and stores only when all read cleanly, in one transaction (`storeLiveSample`). `compare.ts` lists every kind, record, finding and headline mismatch against offline mode.
- `scripts/audit-live/index.ts` exposes it as `pnpm audit:live` (`--dump` writes each extraction to `$DATA_DIR/live-dump/`).

## Conventions

- Every module starts with `import "server-only"`. Scripts that import it run under `tsx --conditions=react-server`.
- Functions take `db` first and a `clock` (`() => number`, default `Date.now`) last, read once for the start and once for the finish. Tests pass a fixed clock and an `openDb(":memory:")` database.
- The `lib/db` functions called inside `runSampleAudit`'s transaction open their own; better-sqlite3 runs them as savepoints, so pass the same `db` and never swap the driver without revisiting this.
- A save that fails on the committed sample is a bug, so it throws (`orThrow` from `lib/schemas/result.ts`).
- Live records come from the model, so a save the database refuses there is expected: `storeLiveSample` rolls back and returns `err`, and the run reports that file as `not stored`.

_Drafted during the Feature 6 review, worth a quick human pass._
