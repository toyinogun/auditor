# Review, feat/design-system-ui-foundation, 2026-09-27

**Reviewed by**: Claude Sonnet 5 (author on Claude Opus)
**Scope**: 50 files, branch vs main (PR #9, merge base `8b32a275`)
**Verdict**: Approve with nits

## Summary
This change turns `DESIGN.md` ("Highlighter Ledger") into working code for spec 0007: the token file and its drift/source-guard tests, the `globals.css` mapping layer, three `next/font/google` faces, seven restyled shadcn primitives, four shared pieces (`Money`, `SummaryTile`, `Chip`, `AppBar`), the `(app)` shell with its routes, a working "Load sample data" button with its reload guard, `/styleguide`, and the `/documents` restyle. The implementation is unusually disciplined about its own invariants: money is rendered only through `Money` (`formatCents` has exactly one caller), amber never leaks outside its allowlist, no component reads a raw `--ds-*` token, there are no `dark:` classes, and `loadSampleData`'s error handling correctly treats a failed audit as an error but a failed uploads-clear as a logged, non-blocking outcome (the fix from 9ac291c holds, with dedicated tests for both the thrown-load and clear-failure paths). I ran the full gate myself: `pnpm typecheck`, `pnpm lint`, `pnpm test` (556 passed, 1 skipped), `pnpm build`, and `pnpm design:lint` (0 errors/warnings) all pass clean, and `grep -rn "dark:"` / `grep -n "\.dark"` found nothing. No blockers or majors; one dead-code minor and a couple of nits below.

## Minor
### 🟡 `headlineText` is now unused outside its own test, `lib/audit/headline.ts:32`
**Problem**: The old `app/page.tsx` called `headlineText(latestHeadline(db))` to pass a formatted string into `UploadPanel`. This change moves that page to `app/(app)/documents/page.tsx` and changes `UploadPanel`'s `headline` prop from `string` to `PanelHeadline | null` (built from the same `Headline` object, formatted inline by the new `HeadlineLine` component in `upload-panel.tsx`). Nothing in `app/`, `lib/`, or the webhook path (`lib/ingest/ingest.ts` passes the `Headline` object directly, unchanged) calls `headlineText` anymore — only `lib/audit/headline.test.ts` does.
**Why it matters**: Dead exported code is a minor maintainability drag: a future reader has to check call sites to learn it's orphaned, and its test now only proves the function still works, not that anything depends on it.
**Suggested fix**: Either remove `headlineText` and its test, or note in `lib/audit/AGENTS.md`/`headline.ts` that it's kept as a public formatting helper for a future non-React consumer (e.g. a CLI or log line) if that's the intent.

## Nits
- ⚪ `app/_components/upload-panel.tsx:9` (`PanelHeadline`) duplicates the shape of `Headline` in `lib/audit/headline.ts` field-for-field; a `import type { Headline } from "@/lib/audit/headline"` would erase at compile time (the module is only `server-only` at runtime) and avoid keeping two structurally identical types in sync by hand.
- ⚪ `components/app-bar.tsx:2-3` imports `LoadSampleButton` and `NavLink` from `app/(app)/_components/`, i.e. a `components/` file reaching into `app/`'s private folder — the reverse of the direction `app/AGENTS.md` describes ("every page and action calls into `lib/` ... and renders with `components/`"). This is explicitly spec-directed (the Component contract table names `AppBar` as "server component that renders the nav and `LoadSampleButton`"), so it's a documented exception rather than an accident, but worth a one-line callout in `components/AGENTS.md` since it's the one place the boundary runs backwards.
- ⚪ `docs/specs/0007-design-system-ui-foundation/verify.md` has every step ticked from a runtime `/check verify` pass per the task context; nothing further to confirm there.

## Strengths
- The AC-4 drift test (`app/styles/design-tokens.test.ts`) is genuinely rigorous: it parses `DESIGN.md`'s YAML front matter, resolves through at most one `var()` hop, normalizes rem/px/color units, and fails with the exact token name and both values on mismatch — and the AC-15 source guards (amber allowlist, token-file isolation) are driven by the same file-scanning helper with its own unit tests for the guard logic itself, independent of the real file tree.
- `loadSampleData`'s three-way outcome handling (thrown audit → rolled back and reported; committed audit + failed clear → live and logged `uploadsCleared: false`; clear rejecting with a non-`Error` value → still handled) is covered by dedicated tests for each branch, matching the spec's "Partial case" scenario precisely.

## Test coverage
All new logic is covered: `reloadWarning` (singular/plural), `chipFor` (all six row statuses), `countDecisions` (count, then zero after `resetAll`), and `loadSampleData` (success, thrown load, clear success/failure/non-Error-rejection, and the decisions-cleared-on-reload case). No new logic was found untested.
