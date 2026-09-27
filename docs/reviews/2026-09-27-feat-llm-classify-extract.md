# Review, feat/llm-classify-extract, 2026-09-27

**Reviewed by**: Claude Sonnet 5 (author on Claude Sonnet 5)
**Scope**: 40 files, branch vs `main` (merge base `9f51c012`)
**Verdict**: Approve with nits

## Summary

This lands spec 0005: one forced tool call per PDF (four strict tools built from the extraction shapes), a single repair turn on a validation failure, `pnpm audit:live` proving the live path against offline mode to the cent, and the CSV parsers' move to `lib/ingest/csv.ts`. The implementation is a careful, literal match to a very detailed spec: the layering (`lib/extract/` never touches the DB, only it imports the SDK) is enforced by both ESLint and dedicated boundary tests, the atomic store/rollback semantics in `lib/audit/live.ts` are correct and well tested (including the documented, slightly surprising case where a bad save gets attributed to the correct file rather than the misread one), and the `store.ts` extraction cleanly de-duplicates save logic between the offline and live runs. No blockers or majors. A few small gaps: two error-handling branches lack test coverage of their logged outcome, one logged value quietly falls outside what AC-12 documents, and the nested `lib/audit/AGENTS.md` wasn't updated for the three new files.

## Minor

### 🟡 Guard failures log `inputMode: null`, which AC-12 doesn't document, `lib/extract/extract.ts:229`
**Problem**: `attempt()` calls `beforeModel(pdf, "bad_input", null)` when `readPdf` fails (not a PDF, too many pages, unreadable), so the logged `inputMode` is `null`. Spec 0005 AC-12 says the log line's `inputMode` is `"text" or "pdf"` with no third option.
**Why it matters**: Anyone building a log dashboard or alert off the documented enum will be surprised by a `null` value on every `bad_input` line, and nothing pins this behavior down (no test asserts `inputMode` for the guard-failure cases in `lib/extract/extract.test.ts`'s `"extractDocument, input guards (AC-7)"` block).
**Suggested fix**: Either update AC-12's wording to note `inputMode` is `null` when the guard fires before the document is read, or add a test asserting the value so a future change can't silently drift.

### 🟡 Two error-handling branches have no test on their logged outcome, `lib/extract/extract.ts:179` and `:234-239`
**Problem**: (a) The missing-`ANTHROPIC_API_KEY` path (`attempt()`, `beforeModel(err(...), "api_error", content.mode)`) logs outcome `"api_error"`, but the corresponding test (`extract.test.ts`, `"fails with zero calls when the key is not set"`) never checks `logged()`. (b) `repairTurn`'s own `call()` can fail with a transport/API error on the second attempt (`if (!second.ok) return apiFailure(context, second.error, 2, usage);`), a branch no test exercises at all.
**Why it matters**: Both are real, reachable branches of error-handling logic (the review guide treats untested error-handling as at least Minor). A refactor could change either outcome label or drop the attempt count without any test failing.
**Suggested fix**: Add an assertion on `logged()[0]` in the missing-key test, and a small case in the repair-turn describe block where the second `createMessage` call throws an `APIError`.

### 🟡 `lib/audit/AGENTS.md` wasn't updated for this feature's new files
**Problem**: The nested context doc still lists only `run.ts` and `sample.ts` under Files; it doesn't mention `compare.ts`, `live.ts` or `store.ts`, all added by this branch.
**Why it matters**: A reader who opens `lib/audit/AGENTS.md` to orient themselves (as the doc invites, "worth a quick human pass") gets an incomplete picture of the module.
**Suggested fix**: Not necessarily this PR's job (the project's convention is that `/sync` reconciles nested `AGENTS.md` files after a merge), but flagging so it isn't missed — the spec's own follow-up list doesn't call this out the way it does for `lib/schemas/AGENTS.md`.

## Nits

- ⚪ `lib/audit/compare.ts:61-66`: the array-diff branch passes the *parent* field's `key` down into `diff(live[index], offline[index], ..., key)` rather than deriving a per-element key. It only behaves correctly today because every array in these schemas holds objects (so the real key comparison happens one level deeper); a future free-text array of bare strings would silently get whitespace-collapsed comparison at the wrong level. Worth a comment, at least.
- ⚪ `lib/audit/store.test.ts:100-111` ("stops at the refusal and saves nothing after it"): asserts `purchaseOrders`/`invoices`/`payments` are empty but not `contracts`, which is the table the failing save actually writes to.

## Strengths

- The import-boundary lint rules correctly work around ESLint flat config's non-merging rule semantics: `lib/ingest/csv.ts`'s block re-declares `paths: [ANTHROPIC_SDK]` alongside its own `patterns: [NO_DB]`, because otherwise the later, more specific config would silently drop the earlier SDK restriction. Easy to get wrong; done right, and covered by `boundaries.test.ts`.
- `lib/audit/store.ts` cleanly extracts the manifest-numbering and save logic shared by the offline (`sample.ts`) and live (`live.ts`) runs, with the existing offline `sample.test.ts` passing unchanged — a real de-duplication, not just a move.
- Test coverage tracks the spec's critical scenarios closely, including a genuinely tricky documented edge case: a save the database refuses can be attributed to the *correct* file rather than the misread one, depending on manifest order, and the tests pin down exactly that (`live.test.ts`, `store.test.ts`).
- Consistent, disciplined redaction: extraction values, failure-reason text and the API key are kept out of `logEvent` calls throughout, verified by tests, not just asserted in comments.

## Test coverage

Strong and close to the spec's own "Critical test scenarios" list; every AC has at least one directly corresponding test, and the CSV/PDF/validation edge cases (header drift, truncated PDFs, page limits, repair turn, rejection, refusal, cut-off, API error, missing key) are all exercised. The gaps are narrow and named above (an untested `inputMode: null` value and two untested error-handling branches around API/key failures); nothing load-bearing to the $9,766.85 acceptance figure is left unverified.
