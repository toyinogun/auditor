# Verify: Export · spec 0009 · updated 2026-09-27
_Steps derived from spec 0009 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual
- [ ] On an empty database, open `/review` → Export sits right of Load sample data, secondary (white, outlined), at 45% opacity; hover it and Tab to it → tooltip "Load sample data first"; clicking does nothing → AC-1, AC-2
- [ ] Press Load sample data → on the next render Export is enabled, no reload needed → AC-2
- [ ] Focus Export, press Enter → menu opens with Excel (.xlsx) then CSV (.csv); arrows move; Escape closes and focus returns to Export; no amber in button or menu → AC-1
- [ ] Choose each item (mouse and keyboard) → the file downloads, the page stays on `/review`, names are `overpayment-findings-<today UTC>.xlsx` / `.csv` → AC-1, AC-10
- [ ] Open the .csv in Excel → `·` shows correctly (BOM), 8 rows, NL88310 `8141.00` Duplicate invoice first, BW-5530 `0.00` Missing reference last, a blank row, Total recoverable `9766.85`, Total approved `0.00` → AC-4, AC-5, AC-7, AC-8, AC-11, AC-13
- [ ] Open the .xlsx → Findings sheet: bold frozen header, filter covers header plus the 8 rows only, amounts are `$` number cells, bold totals; Summary sheet: Pending `8 of 8`, % of invoiced `18.1%` → AC-7, AC-9, AC-13
- [ ] Approve the 7 money findings, reject BW-5530 with a reason containing a comma, a quote and a line break, export again → Total approved `9766.85` equals the Approved tile; BW-5530 reads Rejected with the reason intact and Decided at in UTC; Summary Pending `0 of 8` → AC-6, AC-8, AC-13
- [ ] Reject a finding with the reason `=1+1` and export the csv → the cell reads `'=1+1` and never computes; the .xlsx shows `=1+1` as text → AC-11

## Commands
- [ ] `curl -i "localhost:3000/api/export"`, `?format=XLSX`, `?format=pdf` → 400 `format must be xlsx or csv`, `text/plain; charset=utf-8`, `no-store` → AC-3
- [ ] On an empty database `curl -i "localhost:3000/api/export?format=csv"` → 404 `No audit run yet` → AC-3
- [ ] After a sample load `curl -i "localhost:3000/api/export?format=csv"` → 200, `text/csv; charset=utf-8`, `attachment; filename="overpayment-findings-<date>.csv"`, `no-store` → AC-3, AC-10
- [ ] `curl -X POST localhost:3000/api/export` → 405 → AC-3
- [ ] Server log shows one `{"event":"export",...}` line per request with `outcome` `ok` / `bad_format` / `no_run`, `findingCount` only on ok, and no supplier, filename, reason or amount → AC-14
- [ ] Repeat the csv and xlsx downloads with `DEMO_MODE=true` → same files → AC-15
- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm design:lint` → all pass → AC-16

## Value sourcing
- [ ] Menu enabled state follows `latestAuditRun`: empty database disabled, after a load enabled
- [ ] File name date is the request's UTC date: export just after local midnight in a timezone ahead of UTC and check the name uses the UTC day
- [ ] Total recoverable equals the Recoverable tile and Total approved equals the Approved tile, after approving some findings and rejecting others (including an approved `block_payment` finding, which adds nothing)
- [ ] A decision made on a finding whose amount later changed reads Pending with blank Reason and Decided at
- [ ] Summary: Audit run finished is the run's `finishedAt` in UTC; Exported at is the request time in UTC

## Acceptance-criteria coverage
- AC-1 UI steps 1, 3, 4 · AC-2 UI 1, 2 · AC-3 commands 1 to 4 · AC-4 UI 5 · AC-5 UI 5 · AC-6 UI 7 · AC-7 UI 5, 6 · AC-8 UI 5, 7 · AC-9 UI 6 · AC-10 UI 4, command 3 · AC-11 UI 5, 8 · AC-12 unit test (`readExport` in one transaction) · AC-13 UI 5 to 7 · AC-14 command 5 · AC-15 command 6 · AC-16 command 7
