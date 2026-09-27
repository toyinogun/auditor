# Verify: six audit checks · spec 0004 · updated 2026-09-27
_Steps derived from spec 0004 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

There is no UI in this feature (Feature 10 shows the findings), so every step is a command or a small script over `runChecks`.

## Commands
- [ ] `pnpm test lib/checks` → every test passes, including `index.test.ts` "returns exactly the 8 expected findings" → AC-1, AC-7
- [ ] `pnpm test lib/checks/index.test.ts -t "summarizes"` → `recoverableCents` 976685, `invoicedTotalCents` 5393960, `recoverableShare` `"18.1%"`, `blockedCents` 0 → AC-2
- [ ] `runChecks(briefSampleRecords())` has no finding on NL-88121; its fuel surcharge (380.50 on 15,220.00 at a 2.5% cap) is allowed → AC-3
- [ ] Only one finding is on NL88310 (its `duplicate`); NL-88310 keeps the price, freight and fuel findings → AC-4
- [ ] Drop payments row 5 (NL88310): the duplicate turns `block_payment` at 814100, the summary reads recoverable 162585 and blocked 814100 → AC-5, AC-6
- [ ] Add a third copy `NL 88310` dated later: it comes back `block_payment` because the group has only 2 payments → AC-5
- [ ] Drop payments row 2 (NL-88203): both of its findings turn `block_payment` with the same amounts → AC-6
- [ ] `saveAuditRun` with one `recover`, one `block_payment` and one `review_only` finding stores only the `recover` amount as `recoverable_total_cents` (`pnpm test lib/db/audit.test.ts`) → AC-6
- [ ] Read each calculation: real `−` and `×` signs, `$` and thousands separators, exactly the AC-7 strings → AC-7
- [ ] Every evidence item names a file and a locator that is a clause, `line N`, `charge line N`, `row N` or a fixed invoice label; every input figure in a calculation appears in the evidence → AC-8
- [ ] Missing references: BW-5530 (no PO), a PO-9999 invoice, an invoice dated 2025-12-15, and an unpriced SKU each give one `review_only` $0 finding; the no contract invoice gets no price, surcharge or freight finding → AC-9
- [ ] Split NL-88203's 400 V-belts into 300 then 100 on PO-4502: only the second invoice is flagged, for 40 units ($390.00) → AC-10
- [ ] Remove all PO-4504 receipt rows: each invoice on PO-4504 gets one `review_only` finding with detail `receipt` and no money finding → AC-10
- [ ] A fuel surcharge 1 cent above the cap gives a 1 cent finding; an `other` charge gives a `review_only` finding with detail `charge-line-N`, even with no contract → AC-11
- [ ] Freight on a `not_stated` (Brightwater) or `billable` contract gives no finding → AC-12
- [ ] Two bearing lines at $5.10 and $5.00 give one finding of $600.00; a line below contract never reduces it → AC-13
- [ ] Shuffle every input array: `runChecks` returns a deep equal list; every finding parses with `Finding`; keys are unique → AC-14
- [ ] Add `import { openDb } from "@/lib/db/client"` to any file in `lib/checks/`: `pnpm lint` fails (needs the ESLint guard, still pending) → AC-15

## Value sourcing
- [ ] Contract in force: move an invoice date to the contract's last day (2026-12-31) and one day after; the first still prices, the second gives a `contract` finding → contract in force
- [ ] Duplicate original: give the copy the same date as the original but a lower `documentId`; the lower document becomes the original → duplicate original
- [ ] Paid status counts only the invoice's own number: a payment for another group member does not make an original look paid → action
- [ ] Received ignores receipt dates: move a receipt date after the invoice date; the quantity finding does not change → quantity received
- [ ] Price used falls back to the lowest billed price when the contract has no price for the SKU → quantity price used
- [ ] Cap base is the billed subtotal: raising a line price raises the cap with it → surcharge cap base
- [ ] Summary counts duplicates in `invoicedTotalCents` (6 invoices, $53,939.60) → summary

## Acceptance criteria coverage
- AC-1, AC-7: `index.test.ts` acceptance table · AC-2: summary steps · AC-3: NL-88121 step · AC-4, AC-5: duplicate steps · AC-6: payment and `saveAuditRun` steps · AC-8: evidence step · AC-9: missing reference step · AC-10: partial invoice and no receipt steps · AC-11: surcharge step · AC-12: freight step · AC-13: same SKU step · AC-14: shuffle step · AC-15: lint step (pending the ESLint guard)
