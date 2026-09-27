# Verify: Sample data generator · spec 0003 · updated 2026-09-27
_Steps derived from spec 0003 acceptance criteria and its Value sourcing table. `/check verify` runs these; `/test` locks the durable ones._

## Commands
- [x] `pnpm generate:sample` → prints 15 files and a total, exits 0; `ls public/sample` shows exactly the 12 PDFs, `receipts.csv`, `ap_payments.csv`, `manifest.json` → AC-1
- [x] Drop a stray file into `public/sample/`, run `pnpm generate:sample` → the stray file is gone, no `public/.sample.tmp/` is left behind → AC-1
- [x] Change NL-88310's unit price to `"5.01"` in a scratch copy of the fixture (or run `validate.test.ts`) → the run fails naming `NL-88310.pdf` and `line 1`, exit code is non zero, `public/sample/` is unchanged → AC-2
- [x] `pnpm generate:sample && git status --short public/sample` → no changes (byte identical on every run) → AC-7
- [x] `pnpm exec vitest run scripts/generate-sample` → all pass, including the drift test against the committed files → AC-3 to AC-9
- [x] `cat public/sample/receipts.csv public/sample/ap_payments.csv` → headers `po_number,sku,quantity_received,received_date` and `invoice_number,supplier,amount,paid_date,reference`, one row per fixture row in fixture order, LF endings → AC-6
- [x] `cat public/sample/manifest.json` → 14 entries sorted by filename, `hasTextLayer` false only for `NL88310.pdf`, null for the CSVs, no timestamp → AC-8

## UI / manual (open the PDFs)
- [x] Open `NL-88310.pdf` → Invoice date April 3, 2026, `Terms: Net 30`, Due date May 3, 2026, PO-4504, 1,500 × $5.10 = $7,650.00, Fuel surcharge 4.0% $306.00, Freight $185.00, Total $8,141.00 → AC-3, AC-9
- [x] Open `NL88310.pdf` → looks like a slightly tilted grey scan of the same invoice numbered NL88310, dated May 4, 2026, with the `REMINDER - payment overdue` stamp; selecting text finds nothing; file under 2 MB → AC-4
- [x] Open `C-2026-014.pdf` → Schedule A items 1 to 5, Section 4.2 says freight shall not be invoiced separately, Section 5.1 allows a fuel surcharge up to 2.5% → AC-5
- [x] Open `C-2026-022.pdf` → Schedule A items 1 to 3, Section 6.1 says no surcharges are permitted, the word freight appears nowhere → AC-5
- [x] Open `BW-5530.pdf` → no PO number line (the fixture has none) → AC-3
- [x] Open any PO, e.g. `PO-4502.pdf` → line totals $4,600.00, $1,890.00, $3,900.00 and PO total $10,390.00 (cents arithmetic) → AC-3
- [x] Every page of every PDF shows the footer `Fictional sample document · Overpayment Auditor demo` → AC-9

## Value sourcing checks
- [x] Printed money comes from the fixture through cents: `$15,600.50` on NL-88121 matches the fixture's `"15600.50"` → Value sourcing (money)
- [x] Printed dates are formatted in UTC: run `TZ=Pacific/Kiritimati pnpm generate:sample` and `TZ=Pacific/Pago_Pago pnpm generate:sample`, then `git status --short public/sample` → no changes → Value sourcing (dates, due date, PDF info dates)
- [x] Quantities group in en US whatever the locale: `LANG=de_DE.UTF-8 pnpm generate:sample` → no changes, NL-88121 still prints `2,000` → Value sourcing (quantities)
- [x] Contract section headings come from the fixture clauses (`Section 4.2`, `Section 5.1`, `Section 6.1`) and the `2.5%` cap from `capRate` → Value sourcing (clauses)
- [x] Scan speckle and tilt are seeded: two runs give the same `NL88310.pdf` sha256 in `manifest.json` → Value sourcing (scan noise)

## Acceptance criteria coverage
- AC-1: generate command, stray file step, `write.test.ts` · AC-2: fixture guard step, `validate.test.ts` · AC-3: NL-88310, BW-5530, PO-4502 steps, `render.test.ts` · AC-4: NL88310 step · AC-5: both contract steps · AC-6: CSV step · AC-7: regenerate with no diff, drift test · AC-8: manifest step · AC-9: footer and NL-88310 steps
