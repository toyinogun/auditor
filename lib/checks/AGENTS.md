# lib/checks

The six audit checks as pure functions over `AuditInput`. Governing spec: [0004 six audit checks](../../docs/specs/0004-six-audit-checks/index.md) (per check rules, calculation templates, evidence items and value sourcing live there).

## Files

- `index.ts`: `runChecks(input)`, the pipeline: `buildContext`, then `findDuplicates`, then the five other checks over the originals only. Parses every finding with `Finding` and sorts by amount (largest first), then `findingKey`. Also re-exports `summarizeFindings`.
- `context.ts`: `buildContext`, the read only lookups every check shares (contract in force, PO by number, receipts, payments by normalized invoice number). Answers never depend on input order.
- `duplicate.ts`: `findDuplicates`, runs first; its flagged copies are left out of every other check. Also exports `byInvoiceOrder` (invoice date, then `documentId`).
- `contract-price.ts`, `quantity-received.ts`, `surcharge.ts`, `freight.ts`, `missing-reference.ts`: one check each, `(originals, ctx) => readonly Finding[]`.
- `summary.ts`: `summarizeFindings(invoices, findings)`: recoverable sums `recover` only, blocked sums `block_payment` only. `recoverableShareText` formats the headline percent (one decimal).
- `action.ts`: `actionFor` (paid → `recover`, unpaid → `block_payment`, $0 → `review_only`) and the finding builders `moneyFinding`, `reviewFinding`, `buildFinding`.
- `evidence.ts`: `evidenceItem`, `EVIDENCE_LABEL` (every evidence label the checks write), locators (`line N`, `charge line N`, `row N`, the fixed labels in `INVOICE_LABEL`) and the calculation text pieces (`MINUS` `−`, `TIMES` `×`, `formatQuantity`, `amountsTerm`).
- `invoice-view.ts`: what the review screen draws (spec 0008): `describeInvoiceLines` (received quantity and contract price per line, through `buildContext`), `highlightsFor` (the flagged lines and marked figures, from the finding's own evidence) and `citationsFor`.

## Conventions

- Pure, enforced by ESLint (`eslint.config.mjs`): import only from `@/lib/schemas/*`, `zod` and this folder; no `Date.now` or `Math.random`. No Next, DB, SDK, `fetch` or logging.
- Build every finding with `moneyFinding` or `reviewFinding` so the key comes from `findingKey` and the action from payment status. Never set a money finding's action by hand (the duplicate check is the one exception, AC-5).
- Every figure in a calculation needs an evidence item naming its document and locator. The key detail `charge-line-N` (hyphens) and the locator `charge line N` (spaces) are deliberately different.
- Write evidence labels only through `EVIDENCE_LABEL`: `highlightsFor` decides what the review screen marks from those labels, so renaming one changes the highlights.
- Money is integer cents; only `percentOfCents` rounds. Calculation text uses the real `−` and `×` signs.
- Tests sit beside each check and run on `briefSampleRecords()` (`lib/schemas/fixtures/brief-sample-records.ts`) with no database. `index.test.ts` is the brief's acceptance test (8 findings, $9,766.85): fix the code, never the numbers.

_Drafted by /sync from the introducing change, worth a quick human pass._
