# Review, feat/six-audit-checks, 2026-09-27

**Reviewed by**: Claude Sonnet 5 (author model not recorded for this branch)
**Scope**: 26 files, feat/six-audit-checks vs main (merge base `1cd2905`)
**Verdict**: Approve with nits

## Summary
This lands spec 0004's six pure audit checks (`lib/checks/`), the fixture converter `briefSampleRecords`, and the `saveAuditRun` change to sum only `recover` findings into `recoverable_total_cents`. The pipeline (`buildContext` → `findDuplicates` → five independent checks over the originals) matches the spec's decision exactly, every calculation/evidence template I checked against AC-7/AC-8 matches character for character, and the ESLint purity guard for AC-15 actually fires (verified by hand, see below). `pnpm test`, `pnpm lint`, and `pnpm typecheck` are all green (262/262 tests). I found no correctness, security, or convention issues — only two low-value naming nits.

## Strengths
- The acceptance test (`lib/checks/index.test.ts`) asserts the full AC-1 table (invoice, check, action, key, amount, calculation) plus AC-2/AC-3/AC-4/AC-8/AC-14, and separately exercises AC-5/AC-6 payment-status branches and the empty-input case — this is exactly the brief's numbers-are-the-test bar, and it passes untouched.
- `findDuplicates`'s position/coverage math (`payments.length >= position + 1`, `coveredText`) is subtle (spec AC-5's "k+1 payments" rule) and is exercised with a genuinely tricky set of tests: 0/1/2/3 payments, a payment made against the copy itself, and PO+total matching with a retyped invoice number — all correct.
- `lib/checks/` purity is enforced by an ESLint `no-restricted-imports`/`no-restricted-properties` block, not just a convention note. I confirmed it live: dropping a file with `import { getDb } from "@/lib/db/client"` into `lib/checks/` makes `pnpm lint` fail with exactly the expected message; the codebase itself has zero violations.
- `shareText` (recoverableShare rounding) and `percentOfCents` do the half-away-from-zero rounding with pure integer arithmetic (no floats), and `summary.test.ts` specifically tests the 0.05%→0.1% boundary — good attention to the one place floating point could have crept in.

## Minor

### 🟡 `sumCents` used to sum quantities, not cents, `lib/checks/quantity-received.ts:40`
**Problem**: `quantityOf` calls the shared `sumCents` helper (from `evidence.ts`) to total up `line.quantity` values, which are unit counts, not money.
**Why it matters**: The name asserts a unit ("cents") that doesn't hold for this call site. It's harmless today since the implementation is just `reduce(+, 0)`, but it's the kind of naming mismatch that misleads a future reader (or an LLM extending this file) into treating the result as money-typed.
**Suggested fix**: Either rename the helper to something unit-agnostic (e.g. `sumOf`/`total`) in `evidence.ts` and update its three call sites, or add a distinct `sumQuantities` alias for clarity. Not worth blocking on.

## Nits
- ⚪ `lib/checks/duplicate.ts:35-45`, `groupInvoices` is O(n²) (nested `.some`/`.filter` per invoice per existing group). Fine at this app's scale (one company's invoices), just flagging so it isn't copied into a hot path later.

## Test coverage
Comprehensive and matches the spec's "Critical test scenarios" list one for one: happy path/AC-1/AC-2/AC-7 (`index.test.ts`), NL-88121 clean (AC-3), duplicate paid/unpaid/partial-payment/third-copy variants (AC-4/AC-5/AC-6), partial-invoice quantity splitting with the "already flagged" subtraction (AC-10), missing PO/contract/price (AC-9), surcharge cap boundary and `other` charges (AC-11), freight terms (AC-12), same-SKU-twice contract price (AC-13), shuffle/parse/unique-key stability (AC-14), and the `saveAuditRun` recover-only total (AC-6, `lib/db/audit.test.ts`). I did not find any new branch of the check logic that lacked a corresponding test. All 262 tests pass; `pnpm lint` and `pnpm typecheck` are clean.

