# Review, feat/review-screen, 2026-09-27

**Reviewed by**: Claude Sonnet 5 (author on Claude Sonnet 5)
**Scope**: 39 files, branch vs main (merge base f8b9258)
**Verdict**: Approve with nits

## Summary

This lands spec 0008's review screen: four summary tiles, a findings table with URL-based selection, an invoice drawn as paper with evidence-derived highlights, a decision bar with keyboard shortcuts, and a reject dialog, all backed by a small, well-factored set of pure helpers (`lib/checks/invoice-view.ts`, `lib/audit/review.ts`, `app/(app)/review/_components/decision.ts`, `review-keys.ts`). The evidence-label refactor (`EVIDENCE_LABEL`) is a genuinely good decision that keeps highlighting from silently drifting if a check's copy changes. `decide`'s move to a typed `DecideError` cleanly separates a bad reason from a stale key. I traced the highlighting logic, the decision/next-pending-key flow, the reject validation path (client and server), the stale-key race, and the amber/purity/logging guards; all hold up. `pnpm typecheck`, `pnpm lint`, and `pnpm test` (630 tests) all pass locally. No blockers or majors found.

## Minor

### 🟡 `docs/specs/0008-review-screen/verify.md:37-42` — four Value-sourcing checks left unchecked
Four items in the "Value sourcing" section of the verify doc are unchecked: the rerun-changes-amount-reads-as-pending case, the "0 received / no receipts for SKU" case, the "no contract in force → contract price is `—`" case, and the crafted-`amountCents` case. These are exactly the scenarios `lib/checks/invoice-view.test.ts` and `app/actions.test.ts` cover at the unit level, so the behavior is verified, but the manual verify pass for this spec is not fully closed out as the doc's own checklist claims coverage for. Worth ticking those boxes (or striking them with a note pointing at the covering unit test) before treating spec 0008's verify doc as done.

### 🟡 `app/(app)/review/page.tsx:97-105` — a second visitor's reload can make `SplitPane` throw
`SplitPane` calls `listFindings(db)` in the parent and then `loadAuditInput(getDb())` separately inside itself; between those two reads another visitor's "Load sample data" (which does `resetAll` + reseed in one transaction) can land, leaving `selected.invoiceDocumentId` pointing at a document `describeInvoiceLines` no longer finds, which throws. There's no `error.tsx` anywhere in the app, so this surfaces as Next's generic error page in the shared public demo rather than a friendly message. This is explicitly called out in the spec as "a bug; the page throws" and is genuinely rare (needs a reload to land inside one render), so I'm not blocking on it, but given the demo is one shared audit for every visitor (spec's own stated tradeoff), it's a plausible way for one visitor's click to 500 for another. A targeted `notFound()`/fallback-to-first-row instead of throwing, or reading both `listFindings` and `loadAuditInput` from one snapshot, would close it.

## Nits

- ⚪ `app/(app)/review/page.tsx:97-98`, `SplitPane` calls `getDb()` a second time inside a function whose caller (`ReviewPage`) already has `db` in scope; threading it down as a prop avoids the redundant lookup and keeps one call site per request.
- ⚪ `app/(app)/review/_components/decision-bar.tsx:83-87`, `settle` assumes any `invalid_input` result received while `rejecting` is true means "blank/long reason" and always shows `REASON_REQUIRED`. That happens to be the only way `DecisionInput` can fail today, but it's an implicit coupling to `decide`'s current validation rules rather than something the type system enforces — a future validation rule on `DecisionInput` would silently mislabel its error here.
- ⚪ `lib/audit/review.ts:371-393`, `recordDecision` takes `now: number = Date.now()` rather than the `clock: () => number` last-parameter convention `lib/audit/AGENTS.md` states for this folder ("Functions take `db` first and a `clock`... last"); it matches `decide`'s own signature in `lib/db`, which is a reasonable reason to differ, but the convention doc doesn't call out the exception.

## Strengths

- `EVIDENCE_LABEL` centralizing every label the checks emit, with `highlightsFor` matching against it by dictionary lookup rather than string literals, is exactly the right shape to keep the checks and the review screen's highlighting from silently diverging — and it's backed by a test that runs highlighting over all 8 real sample findings plus every label in isolation (including ones the sample never triggers, like "Billed SKU" and "Invoice date").
- The stale-decision race (AC-12) is handled thoroughly end to end: `recordDecision` re-reads `listFindings` after the write (never trusts stale props), the action revalidates on both success and `finding_not_found`, and the client's `alertShows` logic ties the alert's visibility to the URL's current `finding` param so it disappears exactly when the analyst picks another row — and all three layers are tested (`lib/audit/review.test.ts`, `app/actions.test.ts`, `decision.test.ts`).
- Good separation of pure logic from DOM/React wiring in the keyboard handling (`review-keys.ts` vs `use-review-keyboard.ts`) and the decision-bar copy/alert rules (`decision.ts`), which makes the edge cases (modifiers, focus in a field, dialogs open, mid-save) unit-testable without a browser.

## Test coverage

New pure logic is well covered: `lib/checks/invoice-view.ts` (highlighting per label, line facts, citations), `lib/audit/review.ts` (`reviewTotals`, `nextPendingKey`, `recordDecision` including the logging-never-the-reason assertion), `app/actions.ts`'s `decideFinding`, and the two pure client helpers (`decision.ts`, `review-keys.ts`) all have dedicated test files exercising the acceptance criteria, including the crafted-input and stale-key edge cases. The React components themselves (`decision-bar.tsx`, `reject-dialog.tsx`, `findings-table.tsx`, `invoice-paper.tsx`, `finding-detail.tsx`, `page.tsx`) have no unit tests, consistent with this project's stated convention that UI is confirmed through `/check verify` rather than component tests — `docs/specs/0008-review-screen/verify.md` covers all 17 ACs manually, though see the Minor above about its four unchecked Value-sourcing items.
