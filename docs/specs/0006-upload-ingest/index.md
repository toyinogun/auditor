# 0006. Upload and ingest, one intake path for the browser and n8n

**Date**: 2026-09-27
**Status**: In Progress

## Summary

This spec adds the way real files get into the auditor. You drop PDFs and CSVs on the home page, or n8n posts them to `POST /api/ingest`. Both end up in one function that checks the file, saves it to disk by its hash, extracts or parses it, stores the records and reruns the audit. On the public demo, only the 14 sample files are accepted, and they load from their structured copies, so no document ever reaches the model there. A file that fails stays in the list with its reason and a Retry button, and a restart never leaves a file stuck.

## Requirements

**User stories**:
- As an analyst, I want to drop invoices, contracts, purchase orders and the two CSVs on the page and see each one turn done or failed, so that I know what was read and what the audit now says.
- As the n8n workflow (Feature 12), I want one authenticated endpoint that takes one file and answers with its outcome, so that each Drive file shows up audited and a failure shows in the n8n run log.
- As a demo visitor, I want to upload the sample files and see the same 8 findings, so that I can try intake without an API key.
- As the owner of the public demo, I want outside documents refused before they are stored or sent anywhere, so that the demo costs nothing and holds only fictional data.

**Acceptance criteria**:
- **AC-1**: Browser upload of a PDF. With `DEMO_MODE` off and a key set, a PDF dropped on the home page is saved to `${DATA_DIR}/uploads/<sha256>.pdf`, gets a `documents` row with `source: "upload"` that moves `queued` → `extracting` → `done` with its `kind` and `has_text_layer`, its records are stored, and the audit reruns. The panel row shows `done` and the kind.
- **AC-2**: CSV. A CSV is told apart as receipts or payments by its exact header, whatever the file is called. Its rows are stored under its document, the status moves `queued` → `done` with no model call, and the audit reruns. A header matching neither fails with `not a receipts or payments CSV` followed by both parsers' reasons.
- **AC-3**: Webhook. `POST /api/ingest` with `multipart/form-data`, one `file` part and the right `X-Ingest-Secret` waits for the work and answers `200` with `{ ok: true, value: { documentId, filename, kind, status: "done", alreadyIngested: false, headline } }`. The document's `source` is `webhook`.
- **AC-4**: File type from the bytes. A PDF is a file whose bytes start with `%PDF-`. A CSV is a file named `*.csv` (any case) whose bytes are valid UTF-8 (a leading byte order mark is dropped) and whose header matches AC-2. The claimed `Content-Type` is ignored. Anything else is refused with `unsupported file type: only PDF and CSV files are accepted` before anything is written (webhook `415`).
- **AC-5**: Size. A file over `MAX_UPLOAD_MB` (default 10) is refused with `the file is larger than N MB`, and an empty file with `the file is empty`, before anything is written (webhook `413` and `400`). The webhook refuses a request with no `Content-Length` with `411` `send a Content-Length header`, checks `Content-Length` against the limit plus 64 KiB and answers `413` without reading the body, and also counts the bytes as it streams them in, stopping with `413` once the count passes that limit, so a wrong header cannot make it buffer more. The size check runs before the demo gate on purpose, so an oversized file on the demo gets the size message. The browser checks the size before sending and shows the same message.
- **AC-6**: Webhook guards, in this order. `DEMO_MODE=true` → `503` `intake is disabled on the demo`. `INGEST_SECRET` unset → `503` `intake is not configured`. Missing or wrong `X-Ingest-Secret` → `401` `unauthorized`, compared in constant time, with no body read. A request with no `file` part → `400` `send one file in a multipart field named file`.
- **AC-7**: Demo gate. With `DEMO_MODE=true`, a browser upload is accepted only when its SHA-256 equals a file in `public/sample/manifest.json`. That file's records come from the fixture (`briefSampleRecords`), its `kind` and `has_text_layer` from the manifest, and the audit reruns. The model is never called in demo mode, even with a key set. Any other file is refused with `on the demo, only the sample files can be uploaded`, and nothing is written. Uploading all 14 sample files, in any order, ends at 8 findings, $9,766.85 recoverable, 18.1% of $53,939.60.
- **AC-8**: Same bytes again, by either path. If the stored document is `done`, the answer is that document with `alreadyIngested: true`, and there is no new row, no model call and no rerun. If it is `queued` or `extracting`, the answer is `already being processed` (webhook `409`) with no second call. If it is `failed`, the upload counts as a retry (AC-10).
- **AC-9**: Failures are kept. When extraction fails (spec 0005: rejected, invalid after the repair turn, refused, cut off, API error, no key, unreadable PDF), a CSV fails to parse or convert, or the database refuses a record, the document becomes `failed` with the plain reason in `documents.error`. No records from that file are stored, the audit does not rerun, and the file stays on disk. The panel shows `failed`, the reason and a Retry button. The webhook answers `422` with `{ ok: false, error: <reason>, documentId }`.
- **AC-10**: Retry. Retry on a failed document (or the same bytes uploaded again) runs ingest again from the saved file. Only a `failed` document can be retried, PDF or CSV: the move to `extracting` is one conditional SQL update (`WHERE status = 'failed'`), so a second retry at the same moment gets `already being processed`. The retry works out the file type and CSV kind again from the saved bytes with `detectFile`, because a failed document's `kind` is still null. If the saved file is missing, the document stays `failed` with `the saved file is missing, upload it again`. The demo gate applies to a retry too.
- **AC-11**: Restart sweep. At server start, after migrations, every document in `queued` or `extracting` becomes `failed` with `interrupted by a restart, retry it`, and every leftover `*.tmp-*` file in `${DATA_DIR}/uploads/` is deleted. No model call happens at start. `next dev` reloads may run this again; repeats do no harm.
- **AC-12**: Audit after each file. After each file is stored `done`, `runAudit` runs over everything stored (decisions kept, spec 0002), and the headline in the answer is that run's. Ingesting the 12 sample PDFs (through the fixture fake client) and both CSVs, one at a time and in any order, ends at 8 findings and $9,766.85.
- **AC-13**: Upload panel. The home page shows a drop zone that is also a keyboard reachable button opening a file picker (`multiple`, `.pdf,.csv`). The client sends one Server Action call per file, at most 3 at once. Each row shows the filename, the kind, a status (`uploading`, `done`, `already ingested`, `in progress`, `failed`, `refused`) and any reason, with Retry on failed rows. On load it lists the stored documents, newest first. Below the list, a headline reads `N findings, $X recoverable of $Y invoiced (Z%)`, or `No audit yet`, and refreshes after each file.
- **AC-14**: Reset empties uploads. `loadSample` (used by `pnpm audit:sample` now, and by Load sample data in Feature 10) empties `${DATA_DIR}/uploads/` after its database transaction commits. A load that fails leaves the files in place.
- **AC-15**: Config. `lib/env.ts` adds `INGEST_SECRET` (optional, at least 32 characters when set), `DEMO_MODE` (`true` or `false`, default `false`) and `MAX_UPLOAD_MB` (whole number from 1 to 50, default 10). A bad value fails at startup.
- **AC-16**: Logging. Each ingest writes one `logEvent` line, `event: "ingest"`, with `source`, `filename`, `kind`, `outcome`, `sizeBytes`, `alreadyIngested`, `documentId`, `ms`. It never has the secret, document text, extracted values or the failure reason. A refused webhook call logs only `source`, `outcome` and `ms`.
- **AC-17**: Boundaries. Only `lib/ingest/files.ts` reads or writes the uploads folder. `lib/ingest/detect.ts` is pure. `app/api/ingest/route.ts` runs on the Node runtime. `@anthropic-ai/sdk` stays refused outside `lib/extract/` (spec 0005 AC-13).

## Decision

**Chosen option**: Option 1: one `ingestFile` function in `lib/ingest/`, called by a Server Action and a Route Handler, synchronous in the request.

Both paths turn their input into `{ filename, bytes, source }` and call the same `ingestFile(db, input, deps)`, which returns a `Result`. The edges only handle transport: the action checks nothing the function does not, and the route adds the demo, secret and size guards that only HTTP needs.

**Implementation skills**: `nextjs-patterns` (user skill, `~/.claude/skills/nextjs-patterns/`) · `testing-patterns` (user skill, `~/.claude/skills/testing-patterns/`) · `n8n-workflow-lifecycle-official` (`n8n-io/skills`, `.agents/skills/n8n-workflow-lifecycle-official/`, for the multipart request shape Feature 12 sends)

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Code layout**:

```
lib/ingest/detect.ts   detectFile(filename, bytes): PDF or which CSV, size and empty checks (pure)
lib/ingest/files.ts    createUploadStore(dir): write (temp file then rename), read, clear
lib/ingest/demo.ts     sampleFor(sha256): the manifest entry and fixture records for a sample file
lib/ingest/ingest.ts   ingestFile, retryDocument, the IngestDeps type, one log line each
lib/ingest/deps.ts     ingestDeps(): real deps from lib/env.ts and createModelClient()
lib/db/documents.ts    + claimDocument, failInterrupted, listDocuments, getDocument
lib/db/audit.ts        + latestAuditRun
lib/audit/store.ts     + saveDocumentRecords (one document's records, by kind)
lib/audit/sample.ts    + loadSample (runSampleAudit, then clear uploads)
lib/checks/summary.ts  export the share text helper as recoverableShareText
app/actions.ts         "use server": uploadFile(formData), retryUpload(documentId)
app/api/ingest/route.ts  POST, runtime "nodejs"
app/_components/upload-panel.tsx  "use client" drop zone, per file rows, headline
app/page.tsx           reads listDocuments and latestAuditRun, renders the panel
instrumentation.ts     + failInterrupted after getDb()
```

**Data model sketch** (no schema change, no migration):

| Table / place | Fields used | Rules |
|---|---|---|
| disk `${DATA_DIR}/uploads/` | `<sha256>.pdf` or `<sha256>.csv` | written before the row; named only by hash, so no user filename reaches the filesystem |
| `documents` | `id` PK · `sha256` unique · `filename` (as sent, trimmed to its base name, max 255) · `mime_type` (`application/pdf` or `text/csv`) · `size_bytes` · `source` (`upload` / `webhook`) · `kind` null until known · `status` · `error` null · `has_text_layer` null for CSVs · `created_at` · `updated_at` | `insertDocument` dedupes on `sha256` |
| `invoices`, `contracts`, `purchase_orders` | `document_id` FK, unique | 1:1 with a PDF document |
| `receipts`, `payments` | `document_id` FK, `row_no`, unique together | 1:N rows of a CSV document; a second CSV adds its own rows |
| `audit_runs`, `findings`, `decisions` | as spec 0002 and 0004 | `runAudit` replaces findings, keeps decisions |

**State transitions** (`documents.status`):
- PDF: `queued` → `extracting` → `done` | `failed`.
- CSV: `queued` → `extracting` → `done` | `failed` (held in `extracting` only while it is parsed and saved, so a CSV retry is claimed the same way as a PDF; this refines spec 0002's CSV path).
- Retry: `failed` → `extracting` → `done` | `failed`, for both kinds.
- Restart: `queued` | `extracting` → `failed`.
- `done` is final. Only the save functions set `done`, inside the transaction that stores the records (spec 0002).

**`ingestFile` steps** (in order; each refusal returns `err` before the next step):
1. Size and empty check, then `detectFile` (AC-4, AC-5).
2. SHA-256 of the bytes (`node:crypto`).
3. Demo gate: in demo mode, `sampleFor(sha256)` or refuse (AC-7).
4. `files.write(sha256, ext, bytes)`: to `<name>.tmp-<random>`, then rename. Skipped when the file exists.
5. `insertDocument`. If it already existed, branch on its status (AC-8).
6. `claimDocument(db, id, from)`: one statement, `UPDATE documents SET status = 'extracting' … WHERE id = ? AND status = ? RETURNING *`, with `from` = `queued` for a new row or `failed` for a retry. No row back means someone else holds it: answer `in_progress`. Used for PDFs and CSVs alike.
7. Get the records: fixture in demo mode (`sampleFor`); `extractDocument` for a PDF; `parseReceiptsCsv` or `parsePaymentsCsv` plus the converters for a CSV.
8. `saveDocumentRecords`, which marks the document `done` in the same transaction, or `setDocumentStatus(failed, reason)` (AC-9).
9. `runAudit`, then `latestAuditRun` for the headline (AC-12).
10. One `logEvent` (AC-16).

**API surface**:

| Surface | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `POST /api/ingest` | Route Handler, Node runtime | multipart `file` (req); header `X-Ingest-Secret` (req) | `200 { ok: true, value: IngestOutcome }` | shared secret | `503` demo or not configured · `401` · `411` no length · `413` · `415` · `400` · `409` in progress · `422` failed with reason |
| `uploadFile(formData)` | Server Action | `file`: File (req) | `Result<IngestOutcome>` | none (no accounts); demo gate | refused type, size, demo; failed with reason |
| `retryUpload(documentId)` | Server Action | `documentId`: number (req) | `Result<IngestOutcome>` | none; demo gate | not failed, file missing, failed again |
| `ingestFile(db, { filename, bytes, source }, deps)` | function, `lib/ingest/ingest.ts` | as named | `Result<IngestOutcome, IngestError>` | caller's job | as above |
| `retryDocument(db, documentId, deps)` | function, `lib/ingest/ingest.ts` | as named | `Result<IngestOutcome, IngestError>` | caller's job | as above |

`IngestOutcome` = `{ documentId, filename, kind: DocumentKind | null, status: "done" | "in_progress", alreadyIngested: boolean, headline: Headline | null }`. Every error answer from the route has one shape: `{ ok: false, error: string, documentId: number | null }` (`documentId` set for `409` and `422`, null otherwise). `IngestError` = `{ code: "unsupported" | "too_large" | "empty" | "demo_refused" | "in_progress" | "not_failed" | "failed", message: string, documentId: number | null }`. The route maps `code` to the status codes above; `failed` → `422`. `Headline` = `{ findingCount, recoverableCents, invoicedTotalCents, recoverableShare }`.

`IngestDeps` = `{ extract: (input: ExtractInput) => Promise<Result<ExtractedDocument>>, files: UploadStore, demoMode: boolean, maxUploadBytes: number, clock: () => number }`. `ingestDeps()` builds the real one; tests pass fakes (`fixtureClient` from `lib/extract/testing.ts`, a temp folder store, a fixed clock).

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| any ingest | `sha256` | computed from the bytes with `node:crypto` |
| any ingest | `mime_type`, file extension | `detectFile` from the bytes and the `.csv` name (AC-4), never the claimed type |
| any ingest | CSV kind (`receipts_csv` / `payments_csv`) | whichever parser accepts the header (AC-2) |
| any ingest | `filename` | the multipart part's name (webhook) or `File.name` (browser), base name only, max 255 |
| any ingest | `source` | the caller: `upload` in the action, `webhook` in the route |
| any ingest | `size_bytes`, the size limit | `bytes.length`; `env.MAX_UPLOAD_MB` × 1,048,576 |
| PDF ingest | `kind`, `has_text_layer`, records | `extractDocument` (spec 0005) |
| demo ingest | `kind`, `has_text_layer` | the matching `public/sample/manifest.json` entry |
| demo ingest | records | `lib/ingest/demo.ts` builds `briefSampleRecords` once at module load with placeholder refs (id 0, manifest filename) and groups the result by manifest filename; `sampleFor(sha256)` returns the manifest entry plus that file's records with `documentId` set to the new document's id |
| retry | file type, CSV kind | `detectFile` run again on the saved bytes (`documents.kind` is null while failed) |
| any ingest | `alreadyIngested` | `insertDocument` |
| failure | `documents.error` | the `err` text from `detectFile`, `extractDocument`, the CSV parsers, the converters or the save functions |
| headline | findings, recoverable, invoiced | the newest `audit_runs` row (`latestAuditRun`) |
| headline | the percent | `recoverableShareText(recoverable_total_cents, invoiced_total_cents)`, the rounding spec 0004 uses |
| headline | money text | `formatCents` from `lib/schemas/money.ts` |
| panel list | stored documents | `listDocuments(db)`: id, filename, kind, status, error, newest first, capped at 200 |
| webhook | the expected secret | `env.INGEST_SECRET`; both sides hashed with SHA-256, then `timingSafeEqual` |
| startup | which documents to fail | `status IN ('queued', 'extracting')` |

**Key invariants**:
- The model is never called when `DEMO_MODE` is true (checked inside `ingestFile`, not only at the edges).
- A document is `done` only together with its records (the save functions set it in their transaction).
- A file on disk is always complete: written to a temp name, then renamed.
- No file is written and no row is added for a refused file (type, size, empty, demo).
- At most one extraction or parse runs per document: the claim is a single conditional SQL update, not a read followed by a write.
- The webhook never buffers more than the limit plus 64 KiB, whatever `Content-Length` says.
- The audit reruns only after a file reaches `done`.
- Money comes only from the converters or the fixture, never from the model's arithmetic (spec 0005).

**Security model**:
- No accounts in v1 (spec 0001). The Server Actions are open to whoever can reach the app; on a private server that is you. On the public demo, the demo gate is what protects cost and data: only 14 known hashes pass, nothing else is written, and no model call happens.
- The webhook is off on the demo and needs `INGEST_SECRET` elsewhere. The compare hashes both sides first so lengths match, then uses `crypto.timingSafeEqual`.
- User filenames never become paths; files are named by hash.
- Document text is untrusted; spec 0005 already fences it and validates every value.
- Reasons returned to n8n are the stored `documents.error` text, which never holds document text or the key.
- Data is fictional; no compliance scope applies.

**Configuration required**:
- `INGEST_SECRET`: the shared secret n8n sends in `X-Ingest-Secret`. Optional; unset disables the webhook. At least 32 characters (generate with `openssl rand -hex 32`).
- `DEMO_MODE`: `true` on the public demo. Accepts only sample files, never calls the model, turns the webhook off.
- `MAX_UPLOAD_MB`: per file limit, default 10. `next.config.ts` still reads it from `process.env` for `bodySizeLimit` (config is outside the app), so the browser limit is fixed when the image is built; `lib/env.ts` reads it at runtime for the checks.

**UI notes** (requirements only; Feature 9 and 10 own the look):
- Plain Tailwind elements; shadcn is not set up yet and Feature 9 does that.
- State sync: the page renders `listDocuments` and `latestAuditRun` on the server. The panel keeps its own rows for files in flight, merges each returned `IngestOutcome` or error into them, then calls `router.refresh()` so the server list and headline reload; a server row replaces the local one with the same `documentId`.
- States: empty (no documents, `No audit yet`), uploading, done, already ingested, in progress, failed with reason and Retry, refused with reason.
- The drop zone works with the keyboard (a real `button` or `label` for the file input) and announces row changes with `aria-live="polite"`.

**Critical test scenarios**:
- Happy path: `ingestFile` on `NL-88121.pdf` with the fixture fake client stores an invoice, marks it `done`, reruns the audit and returns a headline, verifies **AC-1**, **AC-12**.
- Full sample: the 12 PDFs (fake client) and both CSVs ingested one by one in shuffled order give 8 findings and 976,685 cents, verifies **AC-2**, **AC-12**.
- Demo: all 14 sample files with `demoMode: true` and a client that throws if called give the brief's headline; a random PDF is refused and the uploads folder stays empty, verifies **AC-7**.
- Failure case: a fake client that answers `reject_document` leaves the row `failed` with the reason, no invoice row, the previous audit run unchanged, and the file on disk; Retry with a good client turns it `done`, verifies **AC-9**, **AC-10**.
- Concurrency: two `ingestFile` calls with the same bytes started together make exactly one model call; the second gets `in_progress`. Two retries of one failed CSV at once save its rows once, verifies **AC-8**, **AC-10**.
- Restart: rows left in `queued` and `extracting` become `failed` after `failInterrupted`, verifies **AC-11**.
- Auth/permission: the route returns `401` for a wrong secret, `503` in demo mode or with no secret, `411` with no `Content-Length`, `413` from `Content-Length` alone without reading the body, and `413` when a streamed body passes the limit under a small declared length, verifies **AC-5**, **AC-6**.

## Build plan

Skateboard: the first two steps make a complete, usable upload in the browser; each later step adds one guard or path and stays shippable.

1. [x] Config and pure pieces: add `INGEST_SECRET`, `DEMO_MODE`, `MAX_UPLOAD_MB` to `lib/env.ts`; write `lib/ingest/detect.ts` (type, size, empty, CSV kind) and `lib/ingest/files.ts` (temp then rename, read, clear) with tests on a temp folder; export `recoverableShareText`; add an ESLint rule refusing `node:fs` in `lib/ingest/` outside `files.ts`. Satisfies **AC-4**, **AC-5**, **AC-15**, **AC-17**.
2. [ ] Thin whole: `saveDocumentRecords`, `claimDocument`, `listDocuments`, `getDocument`, `latestAuditRun`; `ingestFile` for new PDFs and CSVs (no dedupe branches yet) with the log line; `uploadFile` action; `upload-panel.tsx` and the home page with the list and headline. Test with the fixture fake client and in memory SQLite. Satisfies **AC-1**, **AC-2**, **AC-9**, **AC-12**, **AC-13**, **AC-16**.
3. [ ] Duplicates, retry and restart: the `alreadyIngested` branches, `retryDocument` and the `retryUpload` action with the Retry button, the missing file case, and `failInterrupted` (rows plus `*.tmp-*` files) in `instrumentation.ts`. Satisfies **AC-8**, **AC-10**, **AC-11**.
4. [ ] Demo gate and reset: `lib/ingest/demo.ts`, the gate inside `ingestFile`, the all 14 files test, and `loadSample` with `scripts/audit-sample/` switched to it. Satisfies **AC-7**, **AC-14**.
5. [ ] Webhook: `app/api/ingest/route.ts` with the guards in AC-6 order, the `Content-Length` checks and the streaming byte counter, multipart parsing, the status code mapping and route tests calling the exported `POST` with `Request` objects. Satisfies **AC-3**, **AC-5**, **AC-6**, **AC-17**.

## Consequences

**Positive**:
- One function decides everything about a file, so browser and n8n behave the same and are tested once.
- The public demo can show intake with no key, no cost and no risk of outside documents.
- Failures stay visible with a reason and a Retry, and a restart never strands a file.
- No schema change: the tables from spec 0002 already fit.

**Negative / tradeoffs**:
- The request waits for extraction: a scan can take 10 to 20 seconds, and an n8n or browser timeout shorter than that shows an error even though the work finishes.
- Findings are recomputed after every file, so while a batch arrives the list briefly shows findings that later go away (an invoice before its contract shows a missing contract price). Decisions survive by finding key, but an analyst reviewing mid upload can be misled.
- Two overlapping CSV exports double count receipts or payments. Nothing detects that in v1.
- The Server Actions have no rate limit. The demo gate bounds what they can store, but hashing a 10 MB body still costs CPU; a Cloudflare rate rule on the demo (Feature 14) covers it.
- The browser size limit is fixed at build time through `next.config.ts`, while the webhook limit reads the runtime value. Change `MAX_UPLOAD_MB` and rebuild.

**Neutral**:
- `pnpm audit:sample` now also empties `${DATA_DIR}/uploads/`.
- Spec 0001's Demo mode row said the webhook still works on the demo; this spec turns it off there.
- The upload panel is temporary UI; Feature 10 moves and restyles it.

## Follow-up

- [ ] Spec 0001, Demo mode row: note that the webhook is off when `DEMO_MODE=true` (changed by spec 0006).
- [ ] Spec 0002, document lifecycle: note that a CSV now passes through `extracting` while it is parsed (changed by spec 0006).
- [ ] Spec 0001 follow up "retry for a document stuck in `extracting`" is settled here (AC-10, AC-11); tick it.
- [ ] Feature 12 (n8n Drive intake): send one file per request as multipart field `file`, set the HTTP Request timeout to at least 60 seconds, and treat `409` as "try later", not a failure.
- [ ] Feature 14 (public demo deploy): add a Cloudflare rate limit on the home page's action POSTs; set `DEMO_MODE=true` and leave `INGEST_SECRET` unset.
- [ ] Deferred: detect overlapping CSV exports (same PO and SKU, or same invoice number and reference, from two files).
