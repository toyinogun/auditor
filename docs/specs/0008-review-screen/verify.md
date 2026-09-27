# Verify: review screen · spec 0008 · updated 2026-09-27
_Steps derived from spec 0008 acceptance criteria and its Value sourcing table. `/check verify` runs these; `/test` locks the durable ones. Start each UI run from a fresh sample (`pnpm audit:sample`, or Load sample data)._

## UI / manual
- [ ] Open `/review` at 1440px on a fresh sample → tiles read `$9,766.85` (Amber Wash, spans 2 of 5), `$0.00`, `8 of 8`, `18.1%`; no Findings tile → AC-1, AC-16
- [ ] Look at the table → 8 rows, NL88310 `$8,141.00` first, BW-5530 `$0.00` last; columns Supplier, Invoice (mono), Finding, Decision chip, Amount (right aligned, cents); table 5/12, detail 7/12, 24px gutter → AC-2, AC-16
- [ ] Tab through the table → only the invoice number link in each row takes focus; clicking anywhere on a row selects it; the selected row is Frozen Water with a Deep Lagoon left edge and `aria-current="true"` → AC-2
- [ ] Open `/review` with no param → NL88310 is selected; click two other rows, then press Back twice → the selection walks back; reload → selection kept → AC-3
- [ ] Open `/review?finding=nope` → first row selected, caption "That finding is not in the current audit.", no 404 → AC-3
- [ ] NL88310 detail → invoice number and total carry the Honey swipe, no line flagged → AC-5
- [ ] NL-88310 bearing finding → line 1 flagged (Amber Wash plus 3px marker), `$5.10` unit price and `1,500` quantity swiped, contract price `$4.85` plain → AC-4, AC-5
- [ ] NL-88203 V-belt finding → the belt line shows Qty billed `400` swiped, Qty received `360` plain → AC-4, AC-5
- [ ] BW-5521 energy surcharge, NL-88310 fuel surcharge, NL-88310 freight → the charge amount is swiped on its charge line; Subtotal is never swiped → AC-5
- [ ] BW-5530 → PO number reads "none" and is swiped; Qty received shows `—` on every line (screen reader reads "none"); calculation reads "Review only, no amount claimed" → AC-4, AC-5, AC-6
- [ ] Any finding → evidence line is the stored calculation in mono on Canvas; citations are `filename, locator` pairs joined by ` · ` with no repeats → AC-6
- [ ] Press Approve on NL88310 → spinner on Approve, both buttons disabled while saving, then the selection moves to the next pending row, the chip reads approved, Approved reads `$8,141.00`, Pending `7 of 8`, and the app bar's reload guard now asks before reloading → AC-7, AC-8
- [ ] On the approved finding → Approve is disabled; press Reject, give a reason → it switches to rejected and "Rejected: <reason>" shows above the bar; Approve again replaces it → AC-7, AC-8, AC-10
- [ ] Press Reject, submit an empty and then a spaces only reason → "Enter a reason to reject this finding." under the field, focus back in it, nothing saved; the field stops at 500 characters → AC-9
- [ ] Approve the 7 money findings and reject BW-5530 with a reason → tiles read `$9,766.85`, `$9,766.85`, `0 of 8`, `18.1%`; reload and restart the server → same → AC-10, AC-16
- [ ] Load sample data (confirm the reload guard) → every chip back to pending → AC-10
- [ ] Press ↓ and ↑ → selection moves one row, URL updates without a new history entry, row scrolls into view; ↑ on the first and ↓ on the last do nothing; A approves, R opens the dialog → AC-11
- [ ] Type "a" and "r" inside the reason textarea → letters appear, nothing approves; hold Ctrl or Cmd with A → nothing happens; caption "↑ ↓ move · A approve · R reject" under the table → AC-11
- [ ] Open the page in two tabs; in tab 2 remove the finding (upload a changed invoice, or reset with a different data set); approve it in tab 1 → Rust alert "This finding changed since the page loaded. The list has been refreshed.", nothing saved, the list refreshes → AC-12
- [ ] A run with 0 findings (upload only a clean invoice such as NL-88121 with its contract and PO) → tiles `$0.00`, `$0.00`, `0 of 0`, `0.0%` and the "No overpayments found / Checked N invoices." panel, no split pane, no keyboard hint → AC-13
- [ ] At 390px with no param → only the table; tap a row → only the detail with an "All findings" back link at top, decision bar at the end in normal flow → AC-14
- [ ] At 390px open the NL-88310 bearing finding (a marked figure in the paper) → the page has no sideways scroll (`scrollWidth` equals the window width); only the paper table scrolls inside its box → AC-14

## Commands
- [ ] `pnpm test` → all pass, including `lib/checks/invoice-view.test.ts`, `lib/audit/review.test.ts`, `app/actions.test.ts`, `review-keys.test.ts`, `decision.test.ts` → AC-1 to AC-12, AC-15, AC-16
- [ ] `pnpm audit:sample` → still prints `$9,766.85` recoverable (the label move did not change a check) → AC-16
- [ ] Approve and reject once in the running app, then read the server output → one `finding_decided` line per call with `status`, `checkId` and `outcome`, and never the reason text → AC-15
- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm design:lint` → all exit clean; `invoice-paper.tsx` is the only new `AMBER_ALLOWLIST` entry → AC-17

## Value sourcing
- [ ] Recoverable and % of invoiced match `latestHeadline` (run `pnpm audit:sample`, compare with its printed line) → Value sourcing: Recoverable, % of invoiced
- [ ] Approve a `block_payment` or `review_only` finding → Approved does not change → Value sourcing: Approved
- [ ] Make a decision, change the finding's amount with a rerun → it reads pending and leaves Approved → Value sourcing: Pending, total
- [ ] Row supplier and invoice number match `suppliers.name` and `invoices.invoice_number` (the NL88310 duplicate shows `NL88310`, not `NL-88310`) → Value sourcing: row supplier, invoice number
- [ ] Qty received on a PO with receipts but none for a SKU reads `0`, on an invoice with no PO reads `—` → Value sourcing: Qty received
- [ ] Contract price reads `—` when no contract is in force on the invoice date → Value sourcing: Contract price
- [ ] Zero findings panel's invoice count equals `latestAuditRun().invoiceCount` → Value sourcing: zero findings invoice count
- [ ] Craft a `decideFinding` call with an extra `amountCents` → the stored decision snapshots the database amount → Value sourcing: stored decision, snapshot amount

## Acceptance-criteria coverage
- AC-1: tiles step, Value sourcing Approved · AC-2: table steps · AC-3: selection and unknown key steps · AC-4: paper steps · AC-5: highlight steps · AC-6: evidence line step · AC-7: approve and switch steps · AC-8: approve step, `nextPendingKey` tests · AC-9: blank reason step · AC-10: persistence and reload steps · AC-11: keyboard steps · AC-12: two tab step · AC-13: zero findings step · AC-14: 390px step · AC-15: log command · AC-16: fresh and all decided steps · AC-17: full pass command
