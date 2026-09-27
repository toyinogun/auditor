# Verify: upload & ingest · spec 0006 · updated 2026-09-27
_Steps derived from spec 0006 acceptance criteria and its Value sourcing table. `/check verify` runs these; `/test` locks the durable ones._

Setup: `DATA_DIR=<scratch>`, `INGEST_SECRET=<64 chars>`, then `pnpm build && pnpm start`. Call the secret `$S`.

## UI / manual
- [x] Open `/` with an empty data folder → drop zone, "Choose files" button, empty list, headline `No audit yet` → AC-13
- [x] Tab to "Choose files", press Enter → the file picker opens (`.pdf,.csv`, multiple) → AC-13
- [x] Pick `ap_payments.csv`, `receipts.csv` and `README.md` together → the CSVs show `done` with kind Payments CSV / Receipts CSV; README shows `refused` with `unsupported file type: only PDF and CSV files are accepted` → AC-2, AC-4, AC-13
- [x] Rename `receipts.csv` to `export.CSV` and upload it into a fresh folder → kind is still Receipts CSV (header decides, not the name) → AC-2, value sourcing (CSV kind)
- [x] Upload `receipts.csv` again → row shows `already ingested`, no new row after reload → AC-8
- [x] With a key set, upload `NL-88121.pdf` → `uploading` then `done`, kind Invoice, headline refreshes → AC-1, AC-12
- [x] With no key, upload a PDF → `failed` with `ANTHROPIC_API_KEY is not set` and a Retry button; Retry fails again cleanly; set the key, restart, Retry → `done` → AC-9, AC-10
- [x] Upload all 12 PDFs and both CSVs (key set) in any order → headline reads `8 findings, $9,766.85 recoverable of $53,939.60 invoiced (18.1%)` → AC-12, value sourcing (headline, percent, money text)
- [x] Pick a file over `MAX_UPLOAD_MB` → `refused` with `the file is larger than 10 MB`, no request sent → AC-5
- [x] `DEMO_MODE=true`, no key: upload the 14 sample files → same brief headline, no `extraction` log lines; upload any other PDF → `refused` with `on the demo, only the sample files can be uploaded`, and `${DATA_DIR}/uploads/` gets no new file → AC-7

## Commands
- [x] `curl -X POST -H "X-Ingest-Secret: $S" -F file=@public/sample/receipts.csv localhost:3000/api/ingest` → `200`, `value.kind: "receipts_csv"`, `alreadyIngested: false`, document `source` is `webhook` → AC-3
- [x] Same call again → `200` with `alreadyIngested: true` → AC-8
- [x] Wrong or missing `X-Ingest-Secret` → `401` `unauthorized` → AC-6
- [x] `DEMO_MODE=true` → `503` `intake is disabled on the demo`; `INGEST_SECRET` unset → `503` `intake is not configured` → AC-6
- [x] Field named `document` instead of `file` → `400` `send one file in a multipart field named file` → AC-6
- [x] `-F file=@package.json;filename=x.txt` → `415` → AC-4
- [x] A PDF with no key → `422` `{ ok: false, error: "ANTHROPIC_API_KEY is not set", documentId: N }` → AC-9
- [x] Request with no `Content-Length` (chunked) → `411`; `Content-Length` above the limit plus 64 KiB → `413` → AC-5
- [x] Stop the server while a PDF extracts (or set a row to `extracting` in SQLite), drop a `x.pdf.tmp-1` into `uploads/`, restart → row is `failed` with `interrupted by a restart, retry it`, temp file gone, log line `startup_sweep` → AC-11
- [x] `pnpm audit:sample` → prints the brief figures and `${DATA_DIR}/uploads/` is empty afterwards → AC-14
- [x] `grep '"event":"ingest"'` in the server log → each line has `source, filename, kind, outcome, sizeBytes, alreadyIngested, documentId, ms` only; no secret, reason or document text → AC-16
- [x] `sqlite3 $DATA_DIR/auditor.db "select sha256, mime_type, size_bytes from documents"` → sha256 matches `shasum -a 256` of the file, uploads file named `<sha256>.<ext>` → AC-1, value sourcing (sha256, mime_type, size_bytes)
- [x] Upload a file named `../../evil.csv` → stored `filename` is `evil.csv`; nothing written outside `uploads/` → value sourcing (filename), security model
- [x] `pnpm env` check: `MAX_UPLOAD_MB=0` or `DEMO_MODE=yes` or a 10 character `INGEST_SECRET` → the server fails at start → AC-15
- [x] `pnpm lint && pnpm test` → green, including `boundaries.test.ts` (no `node:fs` in `lib/ingest` outside `files.ts`) → AC-17

## Acceptance-criteria coverage
- AC-1 UI PDF step, sqlite hash step · AC-2 CSV steps · AC-3 webhook 200 · AC-4 README / x.txt refusals · AC-5 size steps (UI, 411, 413) · AC-6 webhook guard steps · AC-7 demo step · AC-8 already ingested steps · AC-9 no key failure steps · AC-10 Retry step · AC-11 restart step · AC-12 full sample headline · AC-13 panel steps · AC-14 `pnpm audit:sample` · AC-15 bad config step · AC-16 log step · AC-17 lint and boundaries step
