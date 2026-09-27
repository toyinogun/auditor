# lib/ingest

## Overview

The one intake path for every file (spec 0006). The browser upload (`app/actions.ts`) and the n8n webhook (`app/api/ingest/route.ts`) both turn their input into `{ filename, bytes, source }` and call the same `ingestFile`. It checks the file, saves it by its hash, extracts or parses it, stores its records and reruns the audit.

## Key files

| File | Owns |
|---|---|
| `ingest.ts` | `ingestFile` and `retryDocument`, the `IngestDeps` / `IngestOutcome` / `IngestError` types, one `logEvent` line per call |
| `detect.ts` | `detectFile`: PDF or which CSV, from the bytes; size and empty checks; `baseName`; `BYTES_PER_MB`. Pure |
| `csv.ts` | `parseCsv`, `csvKindOf`, `parseReceiptsCsv`, `parsePaymentsCsv` (header must match the spec 0002 columns exactly, in order). Pure |
| `files.ts` | `createUploadStore(dir)`: `write` (temp file then rename), `read`, `clear`, `sweepTemp`. The only file that touches the uploads folder |
| `demo.ts` | `sampleFor(sha256)`: the demo allowlist, the manifest entry and fixture records for one sample file |
| `webhook.ts` | `handleIngestRequest`: the webhook guards, then `ingestFile`; maps `IngestErrorCode` to HTTP status |
| `deps.ts` | `ingestDeps()` and `uploadStore()`: the real deps from `lib/env.ts`; `UPLOADS_DIR` is `${DATA_DIR}/uploads/` |
| `testing.ts` | Test harness: in memory database, temp uploads folder, fake deps, `seededShuffle`. Never import it from app code |

## Conventions

- Boundaries are enforced by ESLint (`eslint.config.mjs`): no `@anthropic-ai/sdk` anywhere here (the model comes in through `deps.extract`), no `node:fs` outside `files.ts` and `testing.ts`, and `csv.ts` / `detect.ts` never import the database.
- Everything with side effects arrives through `IngestDeps` (`extract`, `files`, `demoMode`, `maxUploadBytes`, `clock`), so tests pass fakes from `testing.ts` instead of mocking modules.
- File type comes from the bytes, never the claimed `Content-Type`: a PDF starts with `%PDF-`; a CSV is `*.csv` (any case) whose header decides receipts vs payments.
- Files are stored as `<sha256>.pdf` or `<sha256>.csv`. The user's filename never reaches the filesystem, and only its base name reaches the database or a log line.
- Expected failures return `err(IngestError)` with a `code`. Adding a code means adding its status to `STATUS_BY_CODE` in `webhook.ts` (the record must stay exhaustive).
- Log lines carry counts, ids and outcomes only (spec 0006 AC-16): never the failure reason, document text or the secret.

## Gotchas

- `claimDocument` (in `lib/db/documents.ts`) moves a document to `extracting` in one conditional `UPDATE`. Two calls on the same bytes never both extract; the loser gets `in_progress`. Keep every path through that claim.
- With `demoMode` on, records come from the fixture via `sampleFor` and `deps.extract` is never called, even with a key set. Any file not in the sample manifest is refused before anything is written.
- The webhook checks, in order: demo, secret configured, secret match (`timingSafeEqual` over hashes), `Content-Length` present and within the limit plus `MULTIPART_OVERHEAD_BYTES`, then a streamed byte cap. It never reads the body before the secret passes.
- A file that fails after it is stored stays `failed` with a plain reason in `documents.error`, and its file stays on disk so `retryDocument` can rerun it. At server start, `failInterrupted` marks anything left `queued` or `extracting` as `failed`.
- `loadSample` (in `lib/audit/sample.ts`) empties the uploads folder, so `pnpm audit:sample` clears uploaded files too.

## Related specs

- [0006 Upload & ingest](../../docs/specs/0006-upload-ingest/index.md), the governing spec
- [0005 LLM classify & extract](../../docs/specs/0005-llm-classify-extract/index.md), CSV parsing (AC-8) and the extraction call
- [n8n/AGENTS.md](../../n8n/AGENTS.md), the webhook's caller

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
