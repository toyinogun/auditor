# 0004. Six audit checks: decision record

The reasoning behind [index.md](index.md). `/develop` does not need this file.

## Context

The brief names six checks and one hard number: 8 findings, $9,766.85 recoverable, 18.1% of $53,939.60 invoiced. Spec 0002 already gives the checks their input (`AuditInput`, readonly records in integer cents with locators) and their output (`Finding` with evidence, keyed by `findingKey`). Spec 0001 requires `lib/checks/` to be pure: no Next, database, SDK or `fetch`.

The six checks are not independent. The same dollar can be seen by more than one of them:
- The reminder copy NL88310 repeats NL-88310's overpriced bearings, its fuel above cap and its freight. Checking it like any invoice adds $375.00 + $114.75 + $185.00 a second time, and its 1,500 bearings push PO-4504 over what was received.
- An overbilled line that is also overpriced can be claimed by both the price and the quantity check.
- A fuel surcharge is a percentage of a subtotal that may itself be inflated.

The brief also leaves rules open that change the answer on real data but not on the sample: which copy of a duplicate is the original, what an unpaid overcharge means, what to do when no contract or receipt exists, and how a "block payment" amount is counted. Spec 0002's follow-up names two of these for this spec to settle. If they are left open, `/develop` invents them, and the review screen, export and stored totals can disagree.

## Options considered

### Option 1: Six independent checks over every invoice

Each check runs over all invoices with no knowledge of the others; the finding list is their concatenation.

**Pros**:
- Simplest shape; every check is a one file function with no shared state.

**Cons**:
- Counts the duplicate's own price, fuel and freight again and flags its quantity: the sample totals far above $9,766.85. Fixing that means special cases inside every check.
- The quantity and price overlap has no home.

### Option 2: Duplicates first, then five independent checks over the originals (chosen)

One pass finds duplicate groups and removes the later copies; the other five checks each run over the originals with a shared read only context. Remaining overlaps are removed by the rules (quantity priced at the contract price, cap on the billed subtotal).

**Pros**:
- Matches the brief's rule literally ("the duplicate's own issues are not counted a second time") in one place.
- Each of the five checks stays small and testable alone; none reads another's output.
- Evidence and a one line calculation per finding fall out naturally.

**Cons**:
- The duplicate check becomes a gate: a false duplicate hides that invoice's other findings.
- Rules like "price excess units at the contract price" are less obvious than a single reconciled figure and need documenting.

### Option 3: Reconcile each invoice to a "should have been billed" invoice

Build a corrected invoice per original (contract prices, received quantities, permitted surcharges on the corrected subtotal, no included freight), then attribute the difference to checks by component.

**Pros**:
- No double counting by construction, including the surcharge on inflated subtotals.
- One total per invoice that is exactly right.

**Cons**:
- Recomputes the surcharge on a corrected subtotal, which disagrees with the brief (NL-88203 would gain a fuel finding), so the acceptance number fails.
- Attribution order changes the per check amounts, and the brief's one line calculations (`($5.10 − $4.85) × 1,500`) no longer read off a single rule.
- The most code for a 2 to 3 evening build.

## Rationale

The acceptance test decides most of this. Option 1 cannot reach $9,766.85 without special cases in every check, and Option 3 computes a figure the brief does not expect for NL-88203. Option 2 reaches the brief's numbers with each rule stated once, and it keeps the brief's one line calculations, which the review screen and export show verbatim.

The open rules were settled with the engineer:
- **Original of a duplicate**: earliest invoice date, ties by document id. A reminder is always later than the invoice it repeats, and upload order must not change the result. Runner up: first paid, which fails when neither copy is paid.
- **Payment status sets the action everywhere**: an overcharge on an unpaid invoice is money to hold back, not to recover. Keeping "recoverable" to money that actually left makes the headline figure honest. Block amounts carry their real value but are summed separately, so the review screen can show both.
- **Duplicate amount**: the copy's total, as the brief states. Runner up: payments beyond one invoice, more exact for partial payments but harder to read.
- **Quantity versus price overlap**: excess units priced at the contract price keeps both checks independent, and their sum equals "excess × billed price + price difference on received units". Runner up: excess × billed price, which forces the price check to know the excess.
- **Missing references**: no contract in force, an unknown PO and an unrecognized charge are all review only at $0, so they show without inflating the claim. A PO with no receipts at all is treated as "receipts not loaded" rather than "nothing received", to avoid flagging every line when `receipts.csv` is missing. Freight on a contract that says nothing is allowed, because the contract does not forbid it.
- **Same SKU on two lines**: one finding per SKU keeps spec 0002's key format, so decisions stay attached across reruns even if lines are renumbered.

Decided without asking (implementation detail): the shared context is built once per run for lookups; output is sorted by amount then key for stable tests and a stable review list; the share of invoiced is computed in integer tenths of a percent so "18.1%" never depends on floating point; the fixture records helper lives beside the fixture in `lib/schemas/fixtures/` so both the checks' tests and Feature 6 can use it; purity is enforced with ESLint `no-restricted-imports` rather than a test that scans files, because lint already runs in the pre commit hook.
