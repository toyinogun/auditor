# 0004. Six audit checks as pure functions over the audit input

**Date**: 2026-09-27
**Status**: In Progress

## Summary

The six checks are plain TypeScript functions in `lib/checks/`. They read the records from spec 0002 and return findings, each with its amount, a one line calculation and the file and clause behind every figure. Duplicates are found first, and the flagged copy is left out of every other check, so its price, freight and quantity are never counted twice. Every rule where two checks could claim the same dollar is settled here, so the brief's sample comes to exactly 8 findings and $9,766.85.

## Requirements

**User stories**:
- As an analyst, I want every overpayment found with its amount, a calculation I can read and the source of every figure, so that I can approve a claim without opening the documents myself.
- As the offline audit run (Feature 6) and the review screen (Feature 10), I want one pure `runChecks(input)` and one `summarizeFindings(...)`, so that they store and show the same numbers the tests assert.
- As the project, I want the brief's expected findings asserted to the cent with no network, database or model, so that a logic change that breaks $9,766.85 fails a test.

**Acceptance criteria**:
- **AC-1**: `runChecks` on the brief sample returns exactly these 8 findings and no others:

  | Invoice | `checkId` | `action` | Detail | Amount (cents) |
  |---|---|---|---|---|
  | NL88310 | `duplicate` | `recover` | `-` | 814100 |
  | NL-88203 | `quantity_received` | `recover` | `NL-BLT-A42` | 39000 |
  | NL-88310 | `contract_price` | `recover` | `NL-BRG-6204` | 37500 |
  | BW-5521 | `surcharge` | `recover` | `surcharge-energy` | 31110 |
  | NL-88203 | `contract_price` | `recover` | `NL-GSK-0850` | 25000 |
  | NL-88310 | `freight` | `recover` | `freight` | 18500 |
  | NL-88310 | `surcharge` | `recover` | `surcharge-fuel` | 11475 |
  | BW-5530 | `missing_reference` | `review_only` | `po` | 0 |

- **AC-2**: `summarizeFindings` on the sample and those findings returns `invoiceCount` 6, `invoicedTotalCents` 5393960, `recoverableCents` 976685, `blockedCents` 0, `findingCount` 8 and `recoverableShare` `"18.1%"`.
- **AC-3**: NL-88121 produces no finding. A fuel surcharge exactly at its cap (380.50 = 2.5% × 15,220.00) is allowed.
- **AC-4**: Duplicates. Two invoices of the same supplier are duplicates when `normalizeInvoiceNumber` matches, or when both print the same PO number and the same total. Group members are ordered by invoice date, then lower `documentId`; the first is the original, and every later copy gets one `duplicate` finding for its own total. The flagged copy is left out of all five other checks and out of the cumulative billed quantity on its PO. On the sample, NL88310 is flagged and NL-88310 is the original.
- **AC-5**: Duplicate action. Payments for a group are the ledger rows of the same supplier whose normalized invoice number matches any member. The later copy at position k in the AC-4 order (the first copy after the original is k = 1) is `recover` when the group has at least k + 1 payments, else `block_payment`. Both carry the copy's full total.
- **AC-6**: Payment status sets the action on every money finding. An invoice is paid when at least one ledger row of the same supplier matches its own `normalizeInvoiceNumber` (other group members' numbers are not counted). A paid invoice gives `recover`; one with none gives `block_payment` with the same amount. `$0` findings are always `review_only`. `recoverableCents` sums only `recover`, `blockedCents` sums only `block_payment`, and `saveAuditRun` stores `recoverable_total_cents` as the sum of `recover` findings only.
- **AC-7**: Calculation text follows the brief's format, with a real minus sign (`−`), a times sign (`×`), dollar signs and thousands separators. On the sample it is exactly:
  - NL88310: `Invoice total $8,141.00, paid twice (ap_payments.csv rows 4, 5) = $8,141.00`
  - NL-88203 V-belt: `(400 billed − 360 received) × $9.75 = $390.00`
  - NL-88310 bearing: `($5.10 − $4.85) × 1,500 = $375.00`
  - BW-5521: `$311.10 energy surcharge, none permitted = $311.10`
  - NL-88203 gasket: `($0.97 − $0.92) × 5,000 = $250.00`
  - NL-88310 freight: `$185.00 freight, included in contract price = $185.00`
  - NL-88310 fuel: `$306.00 − 2.5% × $7,650.00 = $114.75`
  - BW-5530: `Review only, no amount claimed`
- **AC-8**: Evidence. Every finding has at least one evidence item, and every figure in its calculation has an evidence item naming the file and a locator: a contract clause, `line N` (invoice or PO line), `charge line N` (invoice charge), `row N` (CSV), or a fixed invoice label (`Invoice number`, `Invoice date`, `PO number`, `Subtotal`, `Invoice total`).
- **AC-9**: Missing references (`missing_reference`, `review_only`, 0 cents): no PO printed (detail `po`); a printed PO that matches no purchase order (detail `po`); no contract of the supplier in force on the invoice date (detail `contract`); a billed SKU with no price in the contract in force (detail is the SKU; one finding per SKU however many lines bill it). With no contract in force, the price, surcharge and freight checks skip the invoice, except that `other` charges are still flagged (AC-11). With no PO or an unknown PO, the quantity check skips it.
- **AC-10**: Quantity received counts across partial invoices. Per PO and SKU, received is the sum of receipt rows. Invoices on the PO are taken in order (invoice date, then `documentId`), and each is flagged only for the units that push the running billed total over received. Amount = excess units × the contract price in force for that SKU, or the lowest billed unit price on the invoice's lines for it when there is no contract price. A SKU with no receipt row on a PO that has other receipts counts as 0 received. A PO with no receipt rows at all gives one `review_only` 0 cent finding per invoice on it (detail `receipt`) and no money finding.
- **AC-11**: Surcharges. Invoice surcharges of the same type are combined. A type with no row in the contract is not permitted: the whole amount. A type with a cap: amount over `percentOfCents(invoice subtotal as billed, capBps)`, only when above zero. A type with a null cap: no finding. A charge of kind `other` gives a `review_only` 0 cent `surcharge` finding (detail `charge-line-N`), whether or not a contract is in force.
- **AC-12**: Freight. When the contract in force has freight terms `included`, the invoice's freight charges are recovered in full (detail `freight`). Terms `billable` or `not_stated` produce no finding.
- **AC-13**: Contract price. Per invoice and SKU, amount = the sum over its lines of (billed unit price − contract unit price) × quantity, counting only lines billed above contract. Two lines of one SKU give one finding. A line below the contract price never offsets another.
- **AC-14**: The output is safe to store and repeat. Every finding parses with the `Finding` schema, finding keys are unique and built with `findingKey`, the list is sorted by amount (largest first) then key, and shuffling the order of every input array returns the same list.
- **AC-15**: `lib/checks/` imports nothing outside `lib/schemas/` and `zod`, and ESLint fails the build if it does.

## Decision

**Chosen option**: Option 2: Duplicates first, then five independent checks over the originals.

`runChecks` builds one read only lookup context, finds duplicate groups, then runs the price, quantity, surcharge, freight and missing reference checks over the originals only. Overlaps between checks are removed by the rules themselves (quantity is priced at the contract price, and the surcharge cap uses the billed subtotal), not by one check reading another's output.

**Implementation skills**: `testing-patterns` (user skill, `~/.claude/skills/testing-patterns/`) for the fixture driven Vitest tests.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**: no new tables, columns or migration. The checks read `AuditInput` and produce `Finding` exactly as spec 0002 defines them. One storage behavior changes: `saveAuditRun` in `lib/db/audit.ts` sums only findings with `action = "recover"` into `audit_runs.recoverable_total_cents` (today it sums all of them). No stored value is added for the blocked total; `summarizeFindings` derives it at read time.

In memory shapes added in `lib/checks/` (readonly, not stored):

| Shape | Fields |
|---|---|
| `AuditContext` | `contractFor(supplierKey, date)` → `ContractRecord \| null`; `poByNumber` map; `receiptsFor(poNumber, sku)` → `ReceiptRecord[]`; `poHasReceipts(poNumber)`; `paymentsFor(supplierKey, normalizedNumbers)` → `PaymentRecord[]`; `invoiceByDocumentId` |
| `DuplicateResult` | `findings: Finding[]`; `duplicateDocumentIds: ReadonlySet<number>` |
| `AuditSummary` | `invoiceCount`, `invoicedTotalCents`, `recoverableCents`, `blockedCents`, `findingCount`, `recoverableShare` (text, one decimal, such as `"18.1%"`) |

**State transitions**: none. The checks are a pure function of their input; a rerun replaces the findings (spec 0002, AC-12).

**Pipeline** (inside `runChecks`):
1. `buildContext(input)`.
2. `findDuplicates(input.invoices, ctx)` → duplicate findings plus the set of flagged copies.
3. `originals` = invoices not in that set.
4. `checkContractPrice`, `checkQuantityReceived`, `checkSurcharges`, `checkFreight`, `checkMissingReferences`, each `(originals, ctx) => readonly Finding[]`.
5. Concatenate, sort by `amountCents` descending then `findingKey` ascending, return.

**Per check rules** (all amounts in integer cents; only `percentOfCents` rounds):

| Check | Runs on | Fires when | Amount | Detail | Title |
|---|---|---|---|---|---|
| `duplicate` | all invoices | a later copy in a duplicate group (AC-4) | copy's `totalCents` | `-` | `Duplicate of NL-88310, paid twice` or `Duplicate of NL-88310, unpaid` |
| `contract_price` | originals with a contract in force | a SKU billed above its contract price (AC-13) | Σ (billed − contract) × qty | SKU | `<description> billed above contract price` |
| `quantity_received` | originals with a known PO | running billed total passes received (AC-10) | excess × contract price, else lowest billed price | SKU, or `receipt` | `<excess> × <description> billed, not received`, or `No goods receipt found for <PO>` |
| `surcharge` | typed surcharges: originals with a contract in force; kind `other`: every original | not permitted, or above cap (AC-11) | full amount, or amount − cap | `surcharge-<type>`, or `charge-line-N` | `<Type> surcharge not permitted`, `<Type> surcharge above cap`, or `Unrecognized charge: <label>` |
| `freight` | originals with a contract in force | freight terms `included` (AC-12) | Σ freight charges | `freight` | `Freight billed, contract includes it` |
| `missing_reference` | originals | no PO, unknown PO, no contract in force, SKU with no contract price (AC-9) | 0 | `po`, `contract`, or SKU | `No PO`, `PO <number> not found`, `No contract in force on <date>`, `No contract price for <SKU>` |

**Calculation templates** (money through `formatCents`, rates through `formatBps`, quantities with `toLocaleString("en-US")`):
- Duplicate: `Invoice total <total>, paid twice (ap_payments.csv rows <a>, <b>) = <total>`; unpaid: `Invoice total <total>, not yet paid = <total> to block`. List every group payment row.
- Contract price: `(<billed> − <contract>) × <qty> = <amount>`; several lines of one SKU are joined with ` + ` before `= <amount>`.
- Quantity: `(<billed to date> billed − <received> received) × <price> = <amount>`; when earlier invoices on the PO were already over, insert ` − <already over> already flagged` after the received term.
- Surcharge, not permitted: `<amount> <type> surcharge, none permitted = <amount>`. Above cap: `<billed> − <cap %> × <subtotal> = <excess>`. When several charges of one type are combined, the billed term becomes `(<a> + <b>)`, for example `($150.00 + $156.00) − 2.5% × $7,650.00 = $114.75`. Other charge and every 0 cent finding: `Review only, no amount claimed`.
- Freight: `<amount> freight, included in contract price = <amount>`.

**Evidence items per check** (label, value, locator):
- Duplicate: `Invoice number` and `Invoice total` of the copy; `Original invoice` (number, on the original's document, locator `Invoice number`); `Matched on` (`invoice number` or `PO and total`); one `Payment` per group ledger row (`row N` of the payments CSV).
- Contract price: per line, `Billed unit price` and `Quantity billed` (`line N`); `Contract price` (the price's `clause` on the contract document).
- Quantity: `Quantity billed` per line of this invoice (`line N`); `Billed earlier on <PO>` per earlier line (`line N` of that invoice); `Quantity received` per receipt row (`row N`); `Already over on <PO>` when earlier invoices passed received (value is the units already flagged, locator `line N` of the earlier invoice line that crossed); `Price used` (contract clause, or the invoice line).
- Surcharge: `Surcharge billed` per charge (`charge line N`); `Subtotal` (`Subtotal`) and `Cap` (the surcharge's `clause`) when capped; `Permitted surcharges` (`surchargeClause`, else `Surcharge terms`) when not permitted.
- Freight: `Freight billed` per charge (`charge line N`); `Freight terms` (`freightClause`, else `Freight terms`).
- Missing reference: `PO number` (`none` or the printed number, locator `PO number`); `Invoice date` for no contract; `Billed SKU` (`line N`, one item per line) for a SKU with no price.

Two look alike strings are deliberately different: the finding key detail `charge-line-N` (with hyphens, part of `findingKey`) and the evidence locator `charge line N` (with spaces, shown to the analyst). Build them separately.

**API surface** (module functions; no HTTP in this feature):

| Function | Module | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `runChecks(input)` | `lib/checks/index.ts` | `AuditInput` | `readonly Finding[]`, sorted | none (pure) | none expected; a finding that fails `Finding` parsing is a bug and throws |
| `summarizeFindings(invoices, findings)` | `lib/checks/summary.ts` | invoice records, findings | `AuditSummary` | none (pure) | none; zero invoiced gives `"0.0%"` |
| `buildContext(input)` | `lib/checks/context.ts` | `AuditInput` | `AuditContext` | none (pure) | none |
| `findDuplicates(invoices, ctx)` | `lib/checks/duplicate.ts` | invoices, context | `DuplicateResult` | none (pure) | none |
| `checkContractPrice`, `checkQuantityReceived`, `checkSurcharges`, `checkFreight`, `checkMissingReferences` | `lib/checks/<check>.ts` | originals, context | `readonly Finding[]` | none (pure) | none |
| `briefSampleRecords(refFor?)` | `lib/schemas/fixtures/brief-sample-records.ts` | optional `(filename) => DocumentRef`; default numbers documents 1 to 14 in fixture order | `AuditInput` | none (pure) | a fixture that fails conversion throws (a bug) |
| `saveAuditRun(db, run, findings)` (changed) | `lib/db/audit.ts` | unchanged | unchanged; recoverable total sums `recover` only | server only | unchanged |

Shared helpers stay private to `lib/checks/`: `evidence.ts` (evidence builders and the quantity, minus and times formatting), `action.ts` (`actionFor(invoice, ctx, amountCents)`).

**Value sourcing**:

| Action | Value | Source |
|---|---|---|
| every check | supplier match | `supplierKey` on each record (spec 0002) |
| every check | contract in force | `ctx.contractFor(invoice.supplierKey, invoice.invoiceDate)`: `startDate <= date <= endDate` (spec 0002); at most one by spec 0002 AC-10; the "latest `startDate`" fallback only matters for input built by hand (tests, a future JSON path), since stored contracts cannot overlap |
| duplicate | match key | `normalizeInvoiceNumber(invoiceNumber)`, or (`poNumber`, `totalCents`) when `poNumber` is not null |
| duplicate | original | earliest `invoiceDate`, then lowest `documentId` |
| duplicate | payment count, row numbers | `PaymentRecord` rows with the same `supplierKey` whose `normalizeInvoiceNumber(invoiceNumber)` is any group member's key; `rowNo` |
| every money check | `action` | `recover` if `ctx.paymentsFor(invoice.supplierKey, [normalizeInvoiceNumber(invoice.invoiceNumber)])` is not empty (its own number only, not the duplicate group's), else `block_payment`; `review_only` when the amount is 0 |
| contract price | contract unit price, clause | `ContractPriceRecord` with the line's `sku` |
| quantity | received | Σ `quantityReceived` of `ReceiptRecord` with the same `poNumber` and `sku` (receipt dates ignored) |
| quantity | billed to date | Σ `quantity` of that SKU on originals with the same `poNumber`, ordered by `invoiceDate` then `documentId`, up to and including this invoice |
| quantity | price used | contract price for the SKU in force on this invoice's date, else the lowest `unitPriceCents` among this invoice's lines of that SKU |
| surcharge | cap base | `invoice.subtotalCents` as billed |
| surcharge | cap, clause | `ContractSurchargeRecord` of the same `surchargeType`; `surchargeClause` when none exists |
| freight | terms, clause | `contract.freightTerms`, `contract.freightClause` |
| every finding | `findingKey` | `findingKey({ check, supplierKey, invoiceNumber, detail })` (spec 0002) |
| every finding | `invoiceDocumentId` | the flagged invoice's `documentId` |
| evidence | `documentId`, `filename` | the record the figure came from |
| evidence | locator | clause text, `line N` (`lineNo`), `charge line N` (charge `lineNo`), `row N` (`rowNo`), or the fixed labels in AC-8 |
| summary | `invoicedTotalCents`, `invoiceCount` | Σ and count of every invoice's `totalCents`, duplicates included |
| summary | `recoverableCents`, `blockedCents` | Σ `amountCents` of findings with `action` `recover`, and `block_payment` |
| summary | `recoverableShare` | `recoverableCents × 1000 / invoicedTotalCents`, rounded half away from zero to a whole number of tenths of a percent, formatted `"18.1%"` |

**Key invariants**:
- The LLM never computes money. Every amount is integer arithmetic on record cents; only `percentOfCents` rounds.
- A flagged duplicate copy appears in exactly one finding (its `duplicate` finding) and contributes nothing to any PO's billed quantity.
- No dollar is claimed twice: the quantity check prices excess units at the contract price, and the price check claims the price difference on every billed unit, so the two sum to the correct total.
- The surcharge cap is computed on the invoice's billed subtotal, never on a corrected one.
- `findingKey` is unique within one `runChecks` result.
- `runChecks` is deterministic and independent of input order.
- `lib/checks/` stays pure: no Next, DB, SDK, `fetch`, `Date.now()` or randomness.

**Security model**: not applicable. The functions are pure, run server side inside Feature 6, and read only fictional sample data. They never log (AGENTS.md: never log document contents).

**Configuration required**: none.

**Critical test scenarios**:
- Happy path: `runChecks(briefSampleRecords())` equals the AC-1 table, the calculations equal AC-7, and the summary equals AC-2, verifies **AC-1**, **AC-2**, **AC-7**.
- Clean invoice: NL-88121 has no finding, verifies **AC-3**.
- Duplicate: NL88310 flagged, NL-88310 kept; dropping the NL88310 payment row turns it into `block_payment` with 814100 cents and makes `recoverableCents` 162585 and `blockedCents` 814100; a third copy with 2 payments is `block_payment`, verifies **AC-4**, **AC-5**, **AC-6**.
- Unpaid overcharge: removing the NL-88203 payment makes its two findings `block_payment`, verifies **AC-6**.
- Partial invoices: split NL-88203's 400 V-belts into invoices of 300 and 100 on PO-4502; only the second is flagged for 40, verifies **AC-10**.
- Missing references: BW-5530 without PO; an invoice with PO-9999; an invoice dated 2025-12-15; a SKU absent from the contract, each one `review_only` finding, and price, surcharge and freight skip the no contract invoice, verifies **AC-9**.
- Surcharges and freight: an `other` charge; a capped fuel surcharge at, and 1 cent above, the cap; freight on a `not_stated` contract, verifies **AC-11**, **AC-12**.
- Same SKU twice: two bearing lines at $5.10 and $5.00 give one finding for their summed difference, verifies **AC-13**.
- Empty input: an `AuditInput` with five empty arrays gives no findings and a summary of zeros with `"0.0%"`, verifies **AC-2**, **AC-14**.
- Stability: every finding parses with `Finding`, keys are unique, and a shuffled input gives a deep equal result, verifies **AC-8**, **AC-14**.
- Purity: an import from `@/lib/db` in `lib/checks/` fails `pnpm lint`, verifies **AC-15**.
- Auth/permission: not applicable (pure functions, no accounts in v1).

## Build plan

Skateboard: first a thin but complete audit (duplicates plus the summary, with the brief's acceptance test written in full and failing only on the checks still to come), then one check at a time until the acceptance test goes green. Tests come first in every step (AGENTS.md).

1. `lib/schemas/fixtures/brief-sample-records.ts` (`briefSampleRecords`), `lib/checks/context.ts` (`buildContext`), `lib/checks/evidence.ts` and `lib/checks/action.ts`, with tests; an ESLint `no-restricted-imports` block for `lib/checks/**` allowing only `@/lib/schemas/*` and `zod`, satisfies **AC-15**.
2. `lib/checks/duplicate.ts`, `lib/checks/summary.ts` and the `runChecks` pipeline in `lib/checks/index.ts`; write `lib/checks/index.test.ts` with the full AC-1, AC-2 and AC-7 tables now (they fail until step 5); change `saveAuditRun` to sum `recover` only and update its test, satisfies **AC-4**, **AC-5**, **AC-6**, **AC-2**.
3. `lib/checks/contract-price.ts` and `lib/checks/missing-reference.ts` with tests, satisfies **AC-9**, **AC-13**.
4. `lib/checks/quantity-received.ts` with tests for partial invoices, missing receipts and the price fallback, satisfies **AC-10**.
5. `lib/checks/surcharge.ts` and `lib/checks/freight.ts` with tests; the acceptance test goes green, plus the evidence, key uniqueness, schema and shuffle tests, satisfies **AC-1**, **AC-3**, **AC-7**, **AC-8**, **AC-11**, **AC-12**, **AC-14**.

## Consequences

**Positive**:
- $9,766.85 is asserted with no network, database or model, so extraction (Feature 7) only has to reproduce the same records.
- Each check is small and testable on its own; overlaps are removed by rules, not by checks reading each other.
- Every finding carries enough evidence for the review screen and the export without a second lookup.

**Negative / tradeoffs**:
- Excess quantity is priced at the contract price, so the quantity finding can read lower than "units × billed price" when the line is also overpriced; the gap sits in the price finding instead. An analyst has to read both.
- Surcharges are not reduced for overbilled units: a fuel surcharge on a subtotal inflated by a price or quantity overcharge is only checked against the cap on the billed subtotal. This matches the brief (NL-88203) but leaves some money on the table.
- "Same PO and same total" can flag two genuine equal partial invoices on one PO. The analyst rejects it; nothing auto recovers.
- A false duplicate also hides that copy's other findings (price, quantity, charges), because the copy is left out of every other check, and rejecting the duplicate finding does not bring them back (`runChecks` does not read decisions). Accepted for v1.
- A later copy of a duplicate is flagged even when only it (not the original) was paid; the block then sits on the wrong copy. Rare, and visible in the evidence.
- Receipt dates are ignored: goods received after the invoice date still count as received.
- The duplicate rule treats "paid" as any ledger row, so a partial payment counts as paid.

**Neutral**:
- `saveAuditRun`'s recoverable total changes meaning (recover only). Spec 0002's value sourcing line for `recoverable_total_cents` needs the same wording.
- Charge evidence uses the locator `charge line N`, a refinement of spec 0002's `line N` so invoice lines and charges are never confused.
- Titles and calculation text are fixed templates here; the review screen and export show them as is.

## Follow-up

- [ ] Update spec 0002's value sourcing row for `recoverable_total_cents` to "sum of findings with action `recover`", its evidence locator row to include `charge line N`, and its finding key detail list to include `po`, `contract`, `receipt`, `surcharge-energy` and `charge-line-N`.
- [ ] Feature 6 (offline audit run): call `runChecks(loadAuditInput(db))` then `saveAuditRun`; consider having `lib/db/testing.ts` `seedBriefSample` reuse `briefSampleRecords` with its document refs.
- [ ] Feature 10 (review screen): read the tiles from `summarizeFindings`, and show `blockedCents` as its own figure (not in recoverable).
- [ ] Feature 11 (export): the total row sums `recover` findings only, matching the review screen.
