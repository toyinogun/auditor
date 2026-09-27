# Review, feat/upload-ingest, 2026-09-27

**Reviewed by**: Claude Sonnet 5 (author on Claude Sonnet 5)
**Scope**: 48 files, branch vs main (merge base `937ad27`)
**Verdict**: Approve with nits

## Summary
This change adds the one intake path for spec 0006: `ingestFile`/`retryDocument` in `lib/ingest/`, called by both the `uploadFile`/`retryUpload` Server Actions and the `POST /api/ingest` webhook, plus the upload panel UI. The design is careful and the implementation matches it closely: file type is judged from bytes (never the claimed `Content-Type` or filename), the uploads folder is written to a temp name then renamed, a single conditional SQL `UPDATE ... WHERE status = ?` claims a document so concurrent ingests of the same bytes never double-extract, the demo gate keeps the model boundary intact, and the webhook's guard order (demo → secret configured → secret match → `Content-Length` → streamed byte cap → multipart parse) matches AC-6/AC-5 exactly, with the body never read before authorization. `pnpm typecheck`, `pnpm lint` and `pnpm test` all pass clean (494 tests), and the brief's acceptance numbers (8 findings, $9,766.85 recoverable) hold both offline and through the fixture-driven live-shaped ingest test. No blockers or majors found; a couple of minor points and some nits below.

## Minor
### 🟡 Raw SQLite constraint text can reach an external caller, `lib/audit/store.ts:183-186` and `lib/ingest/webhook.ts:192-194`
**Problem**: `refusedReason` turns a `SqliteError` into `"the database refused a record: ${error.message}"`, which is stored verbatim in `documents.error` and, for the webhook, returned in the `422` body's `error` field to whoever holds `INGEST_SECRET` (n8n, and anyone who later reuses that secret).
**Why it matters**: `error.message` from better-sqlite3 can include the failing table/column/constraint name (e.g. `UNIQUE constraint failed: contracts.supplier_id`), which is internal schema detail rather than a user-facing reason. It's a narrow exposure (authenticated webhook caller only, and the spec explicitly names this as the source of `documents.error`), so this is a judgment call rather than a clear bug.
**Suggested fix**: Consider mapping known refusal cases (e.g. the overlapping-contract refusal already returns its own `refusal(...)` text) to a stable, generic message before it is persisted, reserving the raw SQLite message for `logEvent` (which never leaves the server) rather than for `documents.error`.

### 🟡 Manual live-headline verification step is still unchecked
**File**: `docs/specs/0006-upload-ingest/verify.md:14`
**Problem**: The one unchecked verify step is uploading all 12 PDFs + both CSVs with a real `ANTHROPIC_API_KEY` and confirming the brief headline through the actual model. Everything else in `verify.md` is ticked.
**Why it matters**: The equivalent path is exercised with the fixture fake client (`lib/ingest/ingest.test.ts`, "ingests the 12 PDFs and both CSVs in a shuffled order...") and passes, so this is low risk, not a gap in logic — but it's the one place where "spec 0006 matches the live model, not just the fixture" hasn't been confirmed end to end, and `AGENTS.md`'s own bar for this feature is `pnpm audit:live` matching offline to the cent.
**Suggested fix**: Run it once with a real key before treating spec 0006 as fully verified, or note explicitly why it's deferred (cost).

## Nits
- ⚪ `1_048_576` (`BYTES_PER_MB`) is independently declared in `next.config.ts:4`, `app/_components/upload-panel.tsx:24`, and exported from `lib/ingest/detect.ts:9` (imported correctly elsewhere, e.g. `webhook.ts`, `deps.ts`). `detect.ts` has no `server-only` guard, so the client component could import it instead of redeclaring it, removing one drift risk (the other, in `next.config.ts`, is inherent to running outside the app and is already called out in the spec).
- ⚪ `convertRows` (`lib/ingest/ingest.ts:129-138`) maps every CSV row through `convert` before checking for the first failure, instead of short-circuiting. Harmless at the sample's row counts, but worth a comment if CSVs are ever expected to grow large.
- ⚪ `STATUS_BY_CODE` in `lib/ingest/webhook.ts:43-52` has entries for `no_file` and `not_failed`, neither of which `ingestFile` (the only function the webhook calls) can actually produce — `no_file` is only raised by `app/actions.ts`, and `not_failed` only by `retryDocument`, which the webhook never calls. Not wrong (the type is `Record<IngestErrorCode, number>`, so it has to be exhaustive), just slightly misleading to a reader looking for how the webhook can reach 409/400 via those codes.

## Strengths
- The concurrency story is genuinely tested, not just asserted: `lib/ingest/retry.test.ts` fires two `ingestFile`/`retryDocument` calls at the same bytes with `Promise.all` and verifies exactly one model call / one set of saved rows, matching the single conditional `UPDATE` in `claimDocument`.
- Guard ordering is exactly right and proven by test: the webhook never reads the body before the secret check (`webhook.test.ts`'s 401 tests assert `read.bytes` stays near zero), and `Content-Length` is checked before any bytes are read, with a genuine streamed-byte cap as a second line of defense against a lying header.
- Path/filename handling is solid: `baseName` strips any path segment before the name ever reaches the database or a log line, and disk storage is by SHA-256 only (`<sha256>.<ext>`), so a hostile filename can't become a path; the temp-file-then-rename write means a file on disk is always complete.
- The ESLint boundary rules (`lib/ingest/**` refusing `node:fs` outside `files.ts`, `lib/checks` staying pure, `@anthropic-ai/sdk` confined to `lib/extract`) are enforced, not just documented, and `pnpm lint`/`pnpm typecheck`/`pnpm test` are all clean on this branch.
- The acceptance numbers hold end to end through the new ingest path (8 findings, $9,766.85 recoverable, 18.1%), verified via the shuffled-order fixture test in both live-shaped and demo-mode ingest.

## Test coverage
Comprehensive for `lib/`: file detection (magic bytes, CSV header, size/empty, BOM, path traversal in `baseName`), the upload store (temp-then-rename, sha-name validation, sweep), `ingestFile`'s full state machine (new PDF, new CSV, duplicate/already-ingested, in-progress, failed-then-retry, restart interruption), the webhook's every guard branch including the two size-limit failure modes, and the pure `upload-rows.ts` merge logic. The one gap is the UI component itself (`upload-panel.tsx`), which has no automated test — consistent with this project's stated convention that UI is confirmed through `/check verify` rather than Vitest, so not flagged as a coverage finding.
