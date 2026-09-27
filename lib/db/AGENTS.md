# lib/db

The only code that touches SQLite (better-sqlite3 + Drizzle). Governing spec: [0002 data model](../../docs/specs/0002-data-model/index.md); migration approach in [0001](../../docs/specs/0001-stack-architecture/index.md).

## Files

- `schema.ts`: the 15 tables. CHECK, unique and foreign key rules mirror the Zod rules in `lib/schemas/`, so keep both in step.
- `client.ts`: `openDb(file)` opens SQLite with WAL and foreign keys on, then applies the migrations in `drizzle/`. `getDb()` is the app's single connection at `$DATA_DIR/auditor.db`; `instrumentation.ts` opens it at server start.
- `documents.ts`: `insertDocument` (dedupes by `sha256`), `setDocumentStatus`, `claimDocument` (one conditional `UPDATE`, so only one caller can move a document to `extracting`), `getDocument`, `listDocuments` (newest first, capped at `DOCUMENT_LIST_LIMIT`) and `failInterrupted` (at server start, `queued`/`extracting` become `failed`, spec 0006 AC-11).
- `records.ts`: `save<Type>` per record type (`saveContract` refuses an overlapping term for the same supplier), `loadAuditInput`.
- `audit.ts`: `saveAuditRun` (replaces all findings in one transaction; `recoverable_total_cents` sums only `recover` findings, spec 0004 AC-6), `listFindings`, `decide`, `latestAuditRun`.
- `admin.ts`: `resetAll`.
- `testing.ts`: test support (`seedBriefSample`, `TEST_NOW`). Never import it from app code.

## Conventions

- Every module here except `schema.ts` starts with `import "server-only"` (`drizzle-kit` reads `schema.ts` outside Next). `vitest.config.mts` maps `server-only` to its empty module for tests.
- After editing `schema.ts`, run `pnpm exec drizzle-kit generate` and commit the new SQL in `drizzle/`. Never edit a committed migration.
- Functions take `db` first. Functions that write a timestamp take `now` (epoch ms, default `Date.now()`) last; `saveAuditRun` takes its start and finish times instead. Tests pass `TEST_NOW` and an `openDb(":memory:")` database.
- Expected failures return `Result`; a finding that names a missing invoice is a bug in the checks and throws, rolling the whole run back.
- A decision stores the amount it approved; it reads as pending when a rerun changes the finding's `amount_cents`.

_Drafted by /sync from the introducing change, worth a quick human pass._
