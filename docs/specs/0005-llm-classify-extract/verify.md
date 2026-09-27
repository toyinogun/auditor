# Verify: LLM classify & extract · spec 0005 · updated 2026-09-27
_Steps derived from spec 0005 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## Commands (no API key needed)
- [ ] `pnpm test lib/extract/tools.test.ts` → every object node in all four tool schemas has `additionalProperties: false` and a full `required`; no `minLength` or `$schema` left → AC-1
- [ ] `pnpm test lib/extract/extract.test.ts` → all 12 fixture documents give `ok` with `attempts: 1`; the request has `tool_choice: any` with `disable_parallel_tool_use`, thinking disabled, 4 strict tools, and no filename anywhere in `messages` → AC-1, AC-3
- [ ] Same file → `NL88310.pdf` is sent as a base64 `document` block with `hasTextLayer: false`; `NL-88121.pdf` as `<document>` text with `--- page 1 ---` → AC-2, AC-11
- [ ] Same file → a wrong line amount on `NL-88203` repairs to `attempts: 2` with an `is_error` tool result naming `line 1`; wrong twice gives `after 2 attempts` → AC-4
- [ ] Same file → `reject_document`, refusal, `max_tokens`, text only reply and HTTP 529 each fail after exactly one call; no key fails with zero calls → AC-5, AC-6
- [ ] `pnpm test lib/extract/pdf.test.ts` → random bytes give `not a PDF`, a 21 page PDF names `21 pages`, a truncated PDF gives `could not read the PDF`, all before any call → AC-7
- [ ] `pnpm test lib/ingest/csv.test.ts` → both sample CSVs parse to the fixture rows; `SKU` gives `column 2: expected sku, found SKU`; a short row names `row 2`; header only is `ok([])` → AC-8
- [ ] `pnpm generate:sample && git status --short public/` → no changes (generator output byte identical after the `parseCsv` move) → AC-8
- [ ] `pnpm test lib/audit/compare.test.ts lib/audit/live.test.ts` → identical records give no mismatch; a price change is reported and clause spacing is not; one failed extraction leaves the earlier run intact; the scan's row has `has_text_layer = 0` → AC-9, AC-10, AC-11
- [ ] Same `extract.test.ts` → the log line has only `event, filename, kind, inputMode, attempts, inputTokens, outputTokens, ms, outcome`, and never the failure reason or any extracted value → AC-12
- [ ] `pnpm test lib/extract/boundaries.test.ts` and `pnpm lint` → the SDK imported outside `lib/extract/`, or `lib/db/` imported from `lib/extract/` or `lib/ingest/csv.ts`, fails lint → AC-13

## Commands (need `ANTHROPIC_API_KEY`, cost real calls)
- [ ] `ANTHROPIC_API_KEY=… pnpm test lib/extract/live.test.ts` → not skipped, passes: the API accepts the generated strict schemas and `NL-88121.pdf` comes back `ok`, `kind: "invoice"` → AC-14
- [ ] `pnpm audit:live` (key in `.env.local` or the shell) → all 14 lines `ok`, `NL88310.pdf` read as an invoice, `Audit run N: 8 findings, $9,766.85 recoverable (18.1% of $53,939.60)`, `Live run matches offline mode.`, exit 0 → AC-9, AC-10, AC-11
- [ ] `pnpm audit:live --dump` → one JSON per PDF in `$DATA_DIR/live-dump/`; open `NL88310.pdf.json` and check `hasTextLayer: false` → AC-11
- [ ] Run `pnpm audit:live` with a bad key → every PDF fails naming `HTTP 401`, `Nothing stored`, exit 1, and `pnpm audit:sample` results still in the database → AC-6, AC-10

## Value sourcing
- [ ] `kind` comes from the tool name: a fake `record_contract` call on an invoice PDF reports `kind: "contract"`, and `audit:live` prints a `kind: live contract, offline invoice` mismatch → Value sourcing, AC-3, AC-9
- [ ] Pass or fail comes from the converter: an arithmetic error the Zod shape allows (line total off by a cent) still triggers the repair turn → Value sourcing, AC-4
- [ ] `hasTextLayer` comes from `readPdf` letters and digits per page (threshold 20): the scan is `false`, every other sample `true`; the stored `documents.has_text_layer` matches → Value sourcing, AC-2, AC-10
- [ ] `attempts` and `usage` are counted and summed: a repaired document reports `attempts: 2` and double the fake's tokens → Value sourcing, AC-4
- [ ] Model id comes from `ANTHROPIC_MODEL`, default `claude-sonnet-5`: set it to another id and the request's `model` changes → Value sourcing
- [ ] Document ids come from `insertDocument` in manifest order: live ids equal a fresh offline run's ids → Value sourcing, AC-10
- [ ] Finding mismatch filename is the finding's invoice file, not the first document → Value sourcing, AC-9
- [ ] Receipt and payment `rowNo` count data rows from 1 with the header excluded → Value sourcing, AC-8

## Acceptance-criteria coverage
- AC-1 tools test, extract happy path · AC-2 pdf test, scan step · AC-3 extract happy path, kind sourcing · AC-4 repair steps · AC-5 rejection step · AC-6 stop and API error steps, bad key run · AC-7 guards · AC-8 CSV steps, generator diff · AC-9 compare tests, real `audit:live` · AC-10 live run tests, bad key run · AC-11 scan steps, real `audit:live` · AC-12 logging step · AC-13 boundaries test, lint · AC-14 gated live smoke test
