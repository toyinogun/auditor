# Verify: Data model · spec 0002 · updated 2026-09-27
_Steps derived from spec 0002 acceptance criteria and its Value sourcing table. `/check verify` runs these; `/test` locks the durable ones._

## Commands
- [ ] `pnpm test` → 8 files, 130 tests pass → AC-1 to AC-15
- [ ] `pnpm test lib/schemas/convert` → all 6 invoices, 2 contracts, 4 POs, 8 receipt rows and 5 payment rows convert; `AuditInput` parses → AC-1
- [ ] `pnpm test lib/schemas/money` → `parseMoney("5.10")` is 510, `parseRate("2.5")` is 250; `"5.105"`, `"1,500.00"`, `"-3.00"`, `"$5.10"` rejected naming the field → AC-2
- [ ] `pnpm test lib/schemas/money` → `percentOfCents(765000, 250)` is 19125 and `percentOfCents(1, 5000)` is 1 → AC-3
- [ ] `pnpm test lib/schemas/convert` → quantity 1.5, 0 and -200 rejected naming the line; received quantity "0", "1.5", "1,000" rejected naming the row → AC-4
- [ ] `pnpm test lib/schemas/convert` → NL-88310 with unit price "5.01" fails naming line 1; wrong subtotal, fuel charge "306.01" and total "8140.00" each fail naming subtotal, charge 1, total → AC-5
- [ ] `pnpm test lib/schemas/convert` → EUR invoice, CAD contract, "usd dollars" PO rejected; lower case "usd" accepted → AC-6
- [ ] `pnpm test lib/db/client` → migration creates exactly the 15 tables; duplicate `sha256`, duplicate `finding_key`, blank reject reason, negative cents, zero quantity refused by SQLite → AC-7
- [ ] `pnpm test lib/db/records` → sample saved then `loadAuditInput()` deep equals the converted records → AC-8
- [ ] `pnpm test lib/db/records` → "Northline Industrial Supply" contract plus "Northline Industrial Supply Inc." payment leave one supplier row → AC-9
- [ ] `pnpm test lib/db/records` → overlapping Northline contract (edge day 2026-12-31, edge day 2026-01-01, inside) refused naming C-2026-014; no contract, supplier or status change stored → AC-10
- [ ] `pnpm test lib/db/documents` → second insert with the same `sha256` returns the first row with `alreadyIngested: true`, one row total → AC-11
- [ ] `pnpm test lib/db/audit` → `saveAuditRun` twice leaves one set of findings; a finding naming a missing invoice rolls the whole run back → AC-12
- [ ] `pnpm test lib/db/audit` → approval survives a rerun; rerun with amount 40000 reads pending; blank reject reason refused → AC-13
- [ ] `pnpm test lib/db/audit` → after `resetAll`, all 15 tables are empty, decisions included → AC-14
- [ ] `pnpm test lib/db/records` and `lib/db/audit` → invoiced total from stored invoices is 5393960 and `audit_runs.invoiced_total_cents` is 5393960 → AC-15
- [ ] `rm -rf data && pnpm build && PORT=3917 pnpm start`, request `/`, stop it, then inspect `data/auditor.db` → `journal_mode` is `wal`, 15 tables plus `__drizzle_migrations` with 1 row → AC-7 (live schema)

## Value sourcing
- [ ] cents from `parseMoney`: change any sample amount to `"7,650.00"` → conversion fails naming that field, never a float → Value sourcing: cents
- [ ] basis points from `parseRate`: `"2.555"` and `"2.5%"` rejected; `"4.0"` stored as 400 on NL-88310 → Value sourcing: basis points
- [ ] `lineNo` is array position from 1: NL-88310 charges read back as lineNo 1 (fuel), 2 (freight) → Value sourcing: lineNo
- [ ] `rowNo` passed by the caller: a bad receipt passed as row 4 reports "row 4" → Value sourcing: rowNo
- [ ] `supplier_id` by normalized key: the payments `supplier` column with "Inc." maps to the contract's supplier → Value sourcing: supplier_id
- [ ] `source`, `sha256`, `size_bytes`, `mime_type` from the caller: `insertDocument` stores exactly what it is given → Value sourcing: insertDocument
- [ ] `has_text_layer`: null after insert; `setDocumentStatus(..., { hasTextLayer: false })` stores false → Value sourcing: has_text_layer
- [ ] `*_at` from `now`: rows written with `TEST_NOW` carry exactly that timestamp → Value sourcing: timestamps
- [ ] `invoiced_total_cents`, `invoice_count`: 5393960 and 6 with the duplicate included → Value sourcing: saveAuditRun totals
- [ ] `recoverable_total_cents`, `finding_count`: sum and count of the findings passed in (37500 and 2 in the test) → Value sourcing: saveAuditRun findings
- [ ] evidence `filename` from `documents.filename` on each loaded record → Value sourcing: evidence filename
- [ ] decision state: no row or `decisions.amount_cents ≠ findings.amount_cents` reads pending → Value sourcing: listFindings

## Acceptance criteria coverage
- AC-1 convert suite · AC-2, AC-3 money suite · AC-4, AC-5, AC-6 convert suite · AC-7 client suite plus live DB step · AC-8, AC-9, AC-10, AC-15 records suite · AC-11 documents suite · AC-12, AC-13, AC-14 audit suite
