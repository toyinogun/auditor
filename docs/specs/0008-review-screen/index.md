# 0008. Review screen with findings, evidence and decisions

**Date**: 2026-09-27
**Status**: In Progress

## Summary

This spec grows the `/review` stub into the screen where an analyst judges every finding. On the left is a table of findings, largest first. On the right is the selected invoice drawn as paper, with the wrong figures highlighted beside the contract price and the quantity received. Under it are the calculation and an Approve or Reject bar, and a reason is required to reject. The selected finding lives in the URL, so a reload keeps your place. Decisions are stored with the existing `decide` function, and nothing new goes into the database.

## Requirements

**User stories**:
- As an AP analyst, I want to see every finding largest first with its evidence beside it, so I can judge each one without opening the PDFs.
- As an analyst, I want to approve or reject a finding in one click (with a reason when I reject), so the claim list reflects my judgment.
- As an analyst, I want to work through the queue from the keyboard, so eight findings take a minute rather than ten.
- As a prospective client watching the demo, I want the tiles to show what was found and what has been approved, so the result reads at a glance.

**Acceptance criteria** (the contract, each criterion is IDed and independently checkable):
- **AC-1**: Summary tiles. With an audit run, `/review` shows four tiles in the `DESIGN.md` asymmetric row (Recoverable spans 2 of 5 columns): **Recoverable** (`latestHeadline().recoverableCents`, `$9,766.85` on the sample, `recoverable` variant), **Approved** (the sum of `amountCents` over findings whose decision state is `approved` and whose `action` is `recover`, as `Money size="lg"`; `$0.00` on a fresh sample), **Pending** (`"<pending> of <total>"`, `8 of 8` on a fresh sample) and **% of invoiced** (`latestHeadline().recoverableShare`, `18.1%`). The Findings tile from spec 0007 is removed.
- **AC-2**: Findings table. At 1024px and wider, the page is a split pane: the table takes 5 of 12 columns and the detail panel 7 of 12, with a 24px gutter. The table columns are Supplier, Invoice (mono), Finding (the finding's `title`), Decision (`Chip`: pending, approved or rejected) and Amount (right aligned, `Money`, always with cents). Rows are in `listFindings` order (amount descending, then id). Rows are 36px with 1px Rule lines and no zebra striping. Every row is clickable and its invoice cell is a real `Link` to `/review?finding=<findingKey>`: the row is `relative` and the link stretches over it with an `after:absolute after:inset-0` overlay (a stretched link), so the whole row is the click target while only one element takes focus. The selected row carries `data-selected` (Frozen Water fill, 2px Deep Lagoon left edge) and `aria-current="true"`. The table has an accessible name ("Findings").
- **AC-3**: Selection. The selected finding comes from the `finding` search param. With no param, the first row (the largest finding) is selected. With a key that is not in the current run, the first row is selected and a `caption` line under the table reads "That finding is not in the current audit." No 404. A reload keeps the selection, and the browser back button walks earlier selections made by clicking.
- **AC-4**: Invoice paper. The detail panel shows the invoice number (mono) and supplier name in `type-headline-md`, then the finding title and its decision chip, then the **invoice well**: a square cornered White sheet in the Desk well, with a 32px margin, laid out like a printed invoice. The supplier block shows supplier name, invoice number, invoice date and PO number (or "none"). The lines table has the columns *Line · Qty billed · Qty received · Unit price billed · Contract price · Amount*. Charge lines (surcharges, freight, other) follow the item lines, each with its label and amount, and the other columns left empty. Subtotal and Total close the sheet. Qty received and Contract price come from `describeInvoiceLines` (AC-5 decides nothing about them); a value that does not exist shows `—` with the screen reader text "none". Every amount and quantity is mono.
- **AC-5**: Highlights. `highlightsFor(finding)` decides what is marked, from the finding's evidence alone. Take every evidence item whose `source.documentId` equals the finding's `invoiceDocumentId`, then apply its label: "Billed unit price" flags line N (from locator `line N`) and marks its unit price; "Quantity billed" flags line N and marks its quantity; "Billed SKU" flags line N and marks no single figure; "Surcharge billed", "Freight billed" and "Charge billed" flag charge line N (from locator `charge line N`) and mark its amount; "PO number" marks the PO field; "Invoice number" marks the invoice number; "Invoice date" marks the invoice date; "Invoice total" marks the total. Any other label (such as "Price used" or "Subtotal") flags and marks nothing, even when it names a line, because it is proof, not the error. The duplicate finding marks both the invoice number and the total on purpose: the whole invoice is the error. A flagged line gets Amber Wash and the 3px Amber Glow marker on its left edge. A marked figure gets the Honey swipe (`rounded-xs`) and `type-data-md-strong`. Contract price and received quantity are never marked. Each of the 8 sample findings produces at least one flagged line or marked figure.
- **AC-6**: Evidence line. Below the paper: one line of mono on Canvas holding the finding's `calculation` exactly as stored, then citations in `type-caption` Slate Water. The citations are each distinct `"<filename>, <locator>"` pair from the evidence, in evidence order, joined with `" · "` (the plain filename, with no "Invoice" or "Contract" prefix: the evidence does not carry the document kind, and `DESIGN.md`'s example wording is illustrative). The review only finding (BW-5530) shows "Review only, no amount claimed" as its calculation, since that is what the check stores.
- **AC-7**: Decision bar. Docked to the bottom of the detail panel: Approve (primary, Check icon) and Reject (secondary, X icon). The button matching the current decision is disabled (the chip already says which). A rejected finding shows "Rejected: <reason>" in `type-body` above the bar. While a decision is saving, both buttons are disabled and the one pressed shows a spinner.
- **AC-8**: Approve. Pressing Approve calls the Server Action `decideFinding({ findingKey, status: "approved", reason: null })`. The action stores the decision through `decide` and calls `revalidateAudit()`. It returns the next pending finding key: the first pending finding after the current one in list order, wrapping to the top, or `null` when none is pending. If the current key is no longer in the list (another visitor reloaded the sample meanwhile), the search starts before the first row. The client then calls `router.replace("/review?finding=<next>", { scroll: false })` (or stays when `null`). The chip, the Approved and Pending tiles and the app bar's reload guard count all update without a manual reload. Approving an already rejected finding replaces the rejection.
- **AC-9**: Reject dialog. Pressing Reject opens a 480px Dialog: title "Reject this finding?", the finding title and amount as a line of context, a required "Reason" textarea (`maxLength` 500), then Cancel (secondary) and Reject (destructive). Submitting a blank or whitespace reason shows "Enter a reason to reject this finding." as the `input-error` under the field and moves focus back to it, with no action call. The server refuses it too: `DecisionInput` requires a non blank reason of at most 500 characters. On success the dialog closes and the selection moves as in AC-8. The copy and layout follow wireframe 1f where it does not conflict with this AC.
- **AC-10**: Persistence. Decisions survive a page reload and a server restart. Deciding again replaces the earlier decision (no history kept). Load sample data clears decisions through spec 0007's reload guard, unchanged. There is no way back to pending other than that.
- **AC-11**: Keyboard. On `/review`, ↑ and ↓ move the selection to the previous or next row (`router.replace(url, { scroll: false })`, then the selected row is scrolled into view with `block: "nearest"`; ↑ on the first row and ↓ on the last do nothing), `A` approves the selected finding, and `R` opens the reject dialog. Keys are ignored while focus is in an input, textarea or contenteditable, while any dialog or menu is open, while a decision is saving, and when Ctrl, Meta or Alt is held. A `caption` under the table reads "↑ ↓ move · A approve · R reject".
- **AC-12**: Stale finding. If `decideFinding` names a finding key that no longer exists (the sample was reloaded in another tab), nothing is saved. The action calls `revalidateAudit()` and returns `finding_not_found`. The decision bar shows a Rust `role="alert"` line in `type-caption`: "This finding changed since the page loaded. The list has been refreshed."
- **AC-13**: No findings. With a run that has 0 findings, the tiles show `$0.00`, `$0.00`, `0 of 0` and `0.0%`, followed by one panel: "No overpayments found" (`type-headline-md`) and "Checked <invoiceCount> invoices." from the run. No split pane, no keyboard hint. With no run at all, spec 0007's empty state is unchanged.
- **AC-14**: Narrow screens. Below 1024px the split pane stacks. With no `finding` param, only the table shows. With a `finding` param, only the detail shows, with a "All findings" back link to `/review` at its top. The decision bar sits at the end of the detail in normal flow.
- **AC-15**: Logging. Every `decideFinding` call logs one `finding_decided` event through `logEvent` with `status`, `checkId` (when the finding exists) and `outcome` (`ok`, `invalid_input` or `finding_not_found`). The reason text is never logged.
- **AC-16**: Acceptance numbers. On a fresh sample load: the tiles read `$9,766.85`, `$0.00`, `8 of 8` and `18.1%`; the table lists 8 rows with NL88310 `$8,141.00` first and BW-5530 `$0.00` last. After approving the 7 money findings and rejecting BW-5530 with a reason, the tiles read `$9,766.85`, `$9,766.85`, `0 of 8` and `18.1%`, and a reload shows the same.
- **AC-17**: Guards. The invoice paper component is the only new file added to `AMBER_ALLOWLIST`. Chips keep their word and icon. `pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm design:lint` all pass.

## Decision

**Chosen option**: Option 2: Server rendered split pane, selection in the URL

The review screen is a server rendered `/review` page that reads the selected finding from `?finding=<key>`. It shows the split pane from wireframe 1a and `DESIGN.md`, with highlights derived from each finding's evidence and line facts looked up through the checks' own context. One `decideFinding` Server Action wraps the existing `decide`.

**Implementation skills**: `shadcn` (`shadcn-ui/ui`, `.agents/skills/shadcn/`) · `tailwind-v4-shadcn` (`secondsky/claude-skills`, `.agents/skills/tailwind-v4-shadcn/`)

**Design source**: [Auditor Wireframes](https://claude.ai/design/p/41c4bab7-232e-4081-8911-fc9e827fd34b?file=Auditor+Wireframes.dc.html) (Claude Design), option **1a split pane** for the page and **1f** for the reject dialog. Layout and copy come from the wireframes. Every value and rule comes from `DESIGN.md` (the "Review screen" paragraph under `## Layout`, and `## Components`). Where the wireframes and this spec disagree, this spec wins: Load sample data stays the app bar's one primary button (spec 0007), and Export arrives with Feature 11.

**Settled during design** (engineer's picks):

| Question | Pick |
|---|---|
| Layout | 1a split pane (table 5/12, detail 7/12) |
| Tiles | Recoverable, Approved (money), Pending (count), % of invoiced |
| After a decision | Move to the next pending finding |
| Highlights | Derived from evidence locators and labels, no schema change |
| Qty received and Contract price columns | New pure lookup in `lib/checks`, reusing `buildContext` |
| Changing a decision | Switch between approved and rejected, no undo to pending |
| Selection | `?finding=<key>` search param |
| Demo state | One shared audit for every visitor; Load sample data resets it |
| Rate limiting | None; bounded input (reason at most 500 characters, key must exist) |
| Keyboard | ↑ ↓ A R ship in this feature |
| Stale key | Alert plus refresh |
| Unknown `finding` param | Fall back to the first finding with a caption |
| No findings | Tiles plus a "No overpayments found" panel |
| Stale decision (amount changed) | Just reads as pending, no note |
| Finding column | The finding's stored `title` |

**Decided while writing** (my calls):
- **One action, not two.** `decideFinding(input)` rather than `approveFinding` plus `rejectFinding`: `decide` already takes the status, and one action means one log event shape and one error type. Runner up: two thin actions, which read slightly better at the call site.
- **The action computes the next pending key**, after the write, from a fresh `listFindings`. The client never guesses from stale props. Runner up: the page precomputes a next key per row, which goes wrong once a decision lands in another tab.
- **`router.replace`, not `push`, after a decision and for arrow keys**, so history holds only the rows you clicked. Clicking a row is a normal `Link` (push). Runner up: push everywhere, which makes back unusable after a queue of eight.
- **`decide` returns a typed error** `{ code: "invalid_input" | "finding_not_found"; message }` instead of a string, so the action can tell a stale key (AC-12) from a bad reason (AC-9) without matching message text. Runner up: validate in the action first, which duplicates `DecisionInput`.
- **Label constants move into `lib/checks/evidence.ts`** (`EVIDENCE_LABEL`), and both the checks and `highlightsFor` import them, so renaming a label in a check cannot silently break highlighting. Runner up: string literals in `highlightsFor`, which can drift.
- **`highlightsFor` and `describeInvoiceLines` live in `lib/checks/invoice-view.ts`.** They are pure and depend on the checks' context and evidence vocabulary, so they belong beside them. `reviewTotals` and `nextPendingKey` live in `lib/audit/review.ts`, since they work on `FindingView` from `lib/db`.
- **Qty received is the total received on the invoice's PO for that SKU** (`ctx.receiptsFor(po, sku)` summed), the same figure the quantity check starts from. It is `null` when the invoice has no PO or the PO has no receipts at all, and `0` when the PO has receipts but none for that SKU.
- **Contract price is the price for the SKU in the contract in force on the invoice date** (`ctx.contractFor`), or `null`.
- **No pagination on the findings table.** A run's findings are bounded by its invoices (8 on the sample). A cap is a follow up if uploads ever produce hundreds.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**: no new tables, columns or migration. The feature reads and writes what spec 0002 defined:

| Entity | Used for | Change |
|---|---|---|
| `audit_runs` | Recoverable, % of invoiced, invoice count (via `latestHeadline`, `latestAuditRun`) | none |
| `findings` (1 per finding, FK `invoice_id` → `invoices`) | table rows, detail, evidence, calculation | none |
| `decisions` (PK `finding_key`, 0..1 per finding by key) | chip, Approved, Pending, reason | none |
| `invoices` → `suppliers` | supplier name and invoice number per row | `listFindings` now joins `suppliers` |
| invoice lines, charges, contracts, receipts | invoice paper, Qty received, Contract price | read through `loadAuditInput` |

Code level changes only:
- `FindingView` gains `supplierName: string` and `invoiceNumber: string` (from `suppliers.name`, `invoices.invoice_number`).
- `DecisionInput.reason` gets `.max(500)`. No database CHECK, no migration.
- `decide` returns `Result<Decision, DecideError>` with `DecideError = { code: "invalid_input" | "finding_not_found"; message: string }`.

New pure types:
- `InvoiceView = { invoice: InvoiceRecord; lines: readonly LineView[] }` where `LineView = InvoiceLineRecord & { receivedQuantity: number | null; contractPriceCents: number | null }`.
- `Highlights = { lines: ReadonlyMap<number, ReadonlySet<"quantity" | "unitPrice">>; charges: ReadonlySet<number>; header: ReadonlySet<"invoiceNumber" | "invoiceDate" | "poNumber" | "total"> }`. A key in `lines` means the line is flagged, even with an empty set.
- `ReviewTotals = { approvedCents: number; pendingCount: number; findingCount: number }`.

**State transitions** (a finding's decision state, as `listFindings` reads it):

```
pending ──Approve──▶ approved ──Reject + reason──▶ rejected
pending ──Reject + reason──▶ rejected ──Approve──▶ approved
approved | rejected ──rerun changes amountCents──▶ pending (the old row stays but reads pending)
any ──Load sample data (reload guard)──▶ pending (decisions table emptied)
```

Page state for the reject dialog: `closed → open → (blank reason) open with error → (submit) saving`, then `saving → closed` on success (selection moves, AC-8), `saving → open with error` on `invalid_input` from the server, or `saving → closed` with the AC-12 alert on the decision bar on `finding_not_found`.

**API surface**:

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `/review` | GET (page) | `finding`: string (opt, search param) | tiles, table, selected detail; or the zero findings panel; or spec 0007's empty state | none (public demo) | unknown `finding` falls back (AC-3), never 404 |
| `decideFinding` | Server Action in `app/actions.ts` | `findingKey`: string (req), `status`: `"approved" \| "rejected"` (req), `reason`: string \| null (req when rejected, ≤500) | `Result<{ status; nextFindingKey: string \| null }, DecideError>` | none (public demo) | `invalid_input` (blank or long reason, bad status), `finding_not_found` (stale key, AC-12) |
| `listFindings(db)` | `lib/db/audit.ts` | db | `readonly FindingView[]` now with `supplierName`, `invoiceNumber` | server only | none |
| `decide(db, input, now?)` | `lib/db/audit.ts` | db, unknown input | `Result<Decision, DecideError>` | server only | as above |
| `describeInvoiceLines(input, invoiceDocumentId)` | `lib/checks/invoice-view.ts` (pure) | `AuditInput`, number | `InvoiceView \| null` | pure | `null` when the invoice is not in the input (a bug; the page throws) |
| `highlightsFor(finding)` | `lib/checks/invoice-view.ts` (pure) | `Finding` | `Highlights` | pure | none |
| `citationsFor(finding)` | `lib/checks/invoice-view.ts` (pure) | `Finding` | `string` (the joined citations) | pure | none |
| `reviewTotals(findings)` | `lib/audit/review.ts` (pure) | `readonly FindingView[]` | `ReviewTotals` | pure | none |
| `nextPendingKey(findings, currentKey)` | `lib/audit/review.ts` (pure) | `readonly FindingView[]`, string | `string \| null` | pure | none |

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| `/review` | Recoverable | `latestHeadline(db).recoverableCents` (spec 0007) |
| `/review` | % of invoiced | `latestHeadline(db).recoverableShare` (rounded per spec 0004) |
| `/review` | Approved | `reviewTotals(listFindings(db)).approvedCents`: sum of `amountCents` where `decision.status === "approved"` and `action === "recover"` |
| `/review` | Pending, total | `reviewTotals(...).pendingCount`, `.findingCount` |
| `/review` | row supplier, invoice number | `FindingView.supplierName` (`suppliers.name`), `.invoiceNumber` (`invoices.invoice_number`) |
| `/review` | row finding text, amount, chip | `FindingView.title`, `.amountCents`, `.decision.status` |
| `/review` | selected finding | `searchParams.finding` matched against `FindingView.findingKey`, else `findings[0]` |
| `/review` | "not in the current audit" caption | `searchParams.finding` present and unmatched |
| `/review` | invoice header, lines, charges, subtotal, total | `describeInvoiceLines(loadAuditInput(db), finding.invoiceDocumentId).invoice` |
| `/review` | Qty received per line | `LineView.receivedQuantity`: `buildContext(input).receiptsFor(invoice.poNumber, line.sku)` summed; `null` with no PO or no receipts on the PO |
| `/review` | Contract price per line | `LineView.contractPriceCents`: `ctx.contractFor(invoice.supplierKey, invoice.invoiceDate)?.prices` matched by SKU |
| `/review` | flagged lines, marked figures | `highlightsFor(finding)` over `finding.evidence` and `EVIDENCE_LABEL` |
| `/review` | evidence line | `finding.calculation` (stored by the checks) |
| `/review` | citations | `citationsFor(finding)` over `finding.evidence[].source.{filename, locator}` |
| `/review` | rejected reason | `FindingView.decision.reason` |
| `/review` | zero findings invoice count | `latestAuditRun(db).invoiceCount` |
| `decideFinding` | stored decision, snapshot amount | `decide(getDb(), input)`, amount from `findings.amount_cents` |
| `decideFinding` | `nextFindingKey` | `nextPendingKey(listFindings(getDb()), input.findingKey)` after the write |
| `decideFinding` | log `checkId` | the finding row read inside the action (absent when not found) |
| App bar | reload guard count | `countDecisions(db)`, refreshed by `revalidateAudit()` (spec 0007, AC-13) |

**Key invariants**:
- The screen never computes a money amount from line data. Every dollar shown is a stored cent value (`amountCents`, `recoverableTotalCents`, line and invoice fields) or a sum of stored `amountCents` (Approved).
- Approved never exceeds Recoverable: both sum `recover` findings of the same run, and Approved counts only decisions whose snapshot amount matches.
- Pending + approved + rejected = findings in the run (a stale decision counts as pending).
- A rejected decision always has a non blank reason (Zod and the existing database CHECK).
- `lib/checks/invoice-view.ts` stays pure (no Next, DB, SDK or `fetch` imports), like the rest of `lib/checks/`.
- Every action that writes decisions calls `revalidateAudit()`, success or `finding_not_found`.

**Security model**: the app has no accounts (spec 0001). `/review` and `decideFinding` are public, as the demo requires. In the demo every visitor shares one audit, so one visitor's decisions are visible to the next, and Load sample data resets them behind the reload guard. The action trusts nothing from the client: the key must exist in the database, the status must be in `DecisionStatus`, and the reason must be non blank and at most 500 characters when rejecting. The amount is always read from the database, never from the client. Server Actions carry Next's built in origin check (CSRF protection). The reason is rendered as React text (escaped), never as HTML. It is analyst content, so it is never logged. No regulated data: the sample is fictional (the brief).

**Configuration required**: none. No new environment variables. `DEMO_MODE` does not change this screen.

**Critical test scenarios** (each maps to an acceptance criterion):
- Happy path: fresh sample load, the tiles read `$9,766.85 · $0.00 · 8 of 8 · 18.1%`, NL88310 is selected with its invoice number and total marked, Approve moves to the next pending row and Approved becomes `$8,141.00`, verifies **AC-1**, **AC-2**, **AC-5**, **AC-8**, **AC-16**
- Pure logic on the brief sample (`seedBriefSample` → `loadAuditInput` → `runChecks`): every one of the 8 findings has at least one highlight; the price findings mark the unit price on the right line; the V-belt finding marks quantity billed; surcharge and freight mark a charge amount; BW-5530 marks the PO field; synthetic "No contract price for SKU" and "No contract in force" findings flag the line and mark the invoice date; `describeInvoiceLines` returns the contract price and received quantity the checks used, verifies **AC-4**, **AC-5**
- `nextPendingKey`: wraps to the top, skips decided rows, starts from the top when the current key is gone, returns `null` when all are decided, verifies **AC-8**
- `reviewTotals`: a stale decision (amount changed) counts as pending and adds nothing to Approved; `block_payment` and `review_only` approvals add nothing to Approved, verifies **AC-1**
- Failure case: reject with a whitespace reason is blocked in the dialog and refused by the action (`invalid_input`); a 501 character reason is refused, verifies **AC-9**
- Failure case: reload the sample in a second tab, then Approve in the first: nothing saved, alert shown, list refreshed, verifies **AC-12**
- Edge: `/review?finding=nope` selects the first finding and shows the caption; a zero findings run shows the clean panel, verifies **AC-3**, **AC-13**
- Keyboard: `A` inside the reject textarea types a letter and does not approve; ↓ on the last row stays put, verifies **AC-11**
- Auth/permission: none by design (public demo). The negative case is input trust: a crafted action call with an unknown key or an extra `amountCents` field stores nothing or ignores the field, verifies **AC-12**, **AC-9**

## Build plan

Skateboard: task 3 is the smallest complete review (see, judge, persist). Tasks 4 and 5 grow it, and each step ships on its own. Tests first for everything in `lib/`, in memory SQLite and the brief sample. UI is confirmed with `/check verify`.

1. **Storage reads and writes.** Tests first in `lib/db/audit.test.ts`: `listFindings` returns `supplierName` and `invoiceNumber`; `decide` returns `finding_not_found` and `invalid_input` as typed errors; `DecisionInput` refuses a reason over 500 characters. Then change `listFindings` (join `suppliers`), `DecisionInput` and `decide`. No migration. Satisfies **AC-2**, **AC-9**, **AC-12**.
2. **Pure view logic.** Move the evidence label strings into `EVIDENCE_LABEL` in `lib/checks/evidence.ts` and use them in the checks (all check tests still pass, `pnpm audit:sample` still prints $9,766.85). Tests first on the brief sample, then write `describeInvoiceLines`, `highlightsFor` and `citationsFor` in `lib/checks/invoice-view.ts`, and `reviewTotals` and `nextPendingKey` in `lib/audit/review.ts`. Satisfies **AC-1**, **AC-4**, **AC-5**, **AC-6**, **AC-8**, **AC-16**.
3. **The thin whole.** `decideFinding` in `app/actions.ts` (action test with an in memory DB: ok, `invalid_input`, `finding_not_found`, `revalidateAudit` called, next key). Then the page: four tiles, the findings table with `Link` rows and `data-selected`, selection from `searchParams.finding`, the detail panel with the invoice paper (`_components/invoice-paper.tsx`, added to `AMBER_ALLOWLIST`), the evidence line and citations, the decision bar and the reject dialog (client pieces in `app/(app)/review/_components/`, pure bits beside them with tests). Satisfies **AC-1**, **AC-2**, **AC-3**, **AC-4**, **AC-5**, **AC-6**, **AC-7**, **AC-8**, **AC-9**, **AC-10**, **AC-16**, **AC-17**.
4. **Edges and narrow screens.** The unknown key caption, the stale key alert, the zero findings panel, and the stacked layout under 1024px with the "All findings" back link. Satisfies **AC-3**, **AC-12**, **AC-13**, **AC-14**.
5. **Keyboard.** One client listener on the review page with its guard logic in a pure `review-keys.ts` (tested: ignored in fields, in dialogs, while saving, with modifiers), plus the hint caption. Satisfies **AC-11**.
6. **Logging and the full pass.** `finding_decided` through `logEvent` (action test asserts the fields and that no reason appears). Then `pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm design:lint`. Satisfies **AC-15**, **AC-17**.

## Consequences

**Positive**:
- The acceptance flow from the brief ("Approve / Reject works") is complete, and Feature 11 can export from `listFindings` plus `reviewTotals` with the same Approved total.
- No schema change, so no migration risk, and the live parity test (`pnpm audit:live`) is untouched.
- Highlights and line facts reuse the checks' own vocabulary and matching, so the screen cannot disagree with the audit about which figure is wrong or what the contract says.
- URL selection makes every finding linkable, which is handy for the demo recording and the README screenshot.

**Negative / tradeoffs**:
- Highlighting depends on evidence labels. A check that cites the invoice with a new label marks nothing until the label is added to the map. The unit test covers every label the six checks emit today (including "Billed SKU" and "Invoice date", which the sample never triggers), not just the sample findings.
- Arrow keys and row clicks each cost one server render. On local SQLite that is quick, but holding ↓ can show a brief lag between the URL and the panel.
- The page calls `loadAuditInput` (every record) on each render to draw one invoice. That is trivial for the sample and would need a targeted query if uploads grew to thousands of invoices.
- In the public demo, decisions are shared between visitors. Two people clicking at once see each other's approvals after their next action.
- No decision history: switching a rejection to an approval loses the old reason.
- Each decision costs one server round trip before the chip changes (no optimistic update). On local SQLite that is well under 100ms.

**Neutral**:
- `decide`'s error type changes from `string` to `DecideError`, and its callers (tests only today) update.
- The Findings tile from spec 0007 AC-11 gives way to Approved and Pending, as 0007's follow up planned.
- `app/(app)/review/` gains a `_components/` folder, following the app convention.

## Follow-up

- [ ] Feature 11 (Export): build from `listFindings` and `reviewTotals` so the total row equals the Approved tile (the scope's "Done when" check).
- [ ] Feature 14 (demo deploy): decide whether the shared demo state needs per visitor isolation or a nightly reset, and whether Cloudflare rate limiting should cover `decideFinding`.
- [ ] If a run ever holds more than about 200 findings, add a cap or pagination to the findings table and a targeted invoice query in place of `loadAuditInput`.
- [ ] `/sync`: update `app/AGENTS.md` (review page, `decideFinding`, the new amber allowlist entry), `lib/db/AGENTS.md` (`listFindings` fields, `decide` error type) and `lib/checks/AGENTS.md` (`invoice-view.ts`, `EVIDENCE_LABEL`).
