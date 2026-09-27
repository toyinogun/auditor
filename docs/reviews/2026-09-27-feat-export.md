# Review, feat/export, 2026-09-27

**Reviewed by**: Claude Sonnet 5 (author on Claude Sonnet 5)
**Scope**: 20 files, branch vs main (merge base `3c4d02b`)
**Verdict**: Approve with nits

## Summary

This change adds the finding-log export (spec 0009): an Export menu in the app bar, `GET /api/export?format=xlsx|csv`, and the `lib/export/` pure module (labels, formatting, table building, csv and xlsx writers) plus `lib/audit/export.ts` for the one-transaction read and route handler. The implementation is careful and exhaustive against the 16 acceptance criteria: the one-row-model design keeps the two file formats from disagreeing, totals are sourced from the same functions the review tiles already use, the csv formula guard and BOM/CRLF handling are correct, and the xlsx sheet layout (frozen header, autofilter bounds, wrap columns, bold totals) matches the spec precisely. Test coverage is thorough (money edge cases, formula injection in both writers, zero-findings-vs-no-run, one-transaction snapshot). I found no correctness or security defects; the only findings are a small redundant DB read and a couple of style nits.

## Minor

### 🟡 Redundant `latestAuditRun` read inside `readExport`, `lib/audit/export.ts:39-46`
**Problem**: `readExport` calls `latestAuditRun(db)` directly and then calls `latestHeadline(db)`, which internally calls `latestAuditRun(db)` again — two identical `SELECT ... ORDER BY id DESC LIMIT 1` queries in the same transaction. The subsequent `run === null || headline === null` check is also effectively dead: `latestHeadline` (`lib/audit/headline.ts:16-18`) returns `null` if and only if `latestAuditRun` returns `null`, so the two conditions can never disagree.
**Why it matters**: Not a correctness bug (both reads happen inside the same transaction and are cheap on SQLite), but it's an easy trap for a future refactor: someone could change `latestHeadline` to return `null` for a different reason and silently break the "no run" detection, or "fix" the apparent redundancy and introduce a real bug.
**Suggested fix**: Compute `headline` from the already-fetched `run` (e.g. give `latestHeadline` an overload that takes a run row, or just inline the headline shape here) so there's one read and one null check, not two of each.

## Nits

- ⚪ `lib/export/csv.ts:8` (and the matching literal in `lib/audit/export.test.ts`'s `lines` helper): `const BOM = "﻿"` embeds a raw invisible U+FEFF character in the source rather than `"﻿"`. It works today, but an invisible character sitting in a string literal is one careless editor/formatter pass away from being silently dropped or mangled; the escape sequence is equivalent and self-documenting.
- ⚪ `lib/export/format.ts:22`: `exportFileName(format: string, now: number)` takes a bare `string` rather than the `ExportFormat` union from `table.ts`. Reasonable — importing `ExportFormat` here would create a cycle with `table.ts`, which already imports from `format.ts` — but a one-line comment noting why would save the next reader a double-take.
- ⚪ `docs/specs/0009-export/verify.md:551-553`: three "Value sourcing" checklist items are still unticked (file name under a UTC-ahead timezone, totals with an approved `block_payment` finding, a stale/pending decision after an amount change). The underlying behavior is already covered — `exportFileName` uses `toISOString()` so it's UTC by construction, and `reviewTotals`'s block_payment handling has a dedicated test in `lib/audit/review.test.ts:73` — but worth ticking off (or explicitly deferring) so the verify doc doesn't read as an open gap.

## Strengths

- One row model (`exportTable` in `lib/export/table.ts`) feeds both the csv and xlsx writers, and both total rows are computed from the same functions the review screen's tiles call (`latestHeadline`, `reviewTotals`), read in one transaction (`readExport`) — the file is guaranteed to reconcile to the screen by construction, not by a test that has to catch drift.
- Formula-injection handling is correct and well tested on both sides: the csv guard (`FORMULA_START` regex, applied before RFC 4180 quoting) matches the spec's exact trigger set, and the xlsx path is verified to write the same hostile strings as plain string cells that Excel never evaluates.
- `CHECK_LABEL`/`ACTION_LABEL`/`DECISION_LABEL` are exhaustive `Record`s over the Zod enums (AC-5), so a new check or action fails typecheck until it's given a label — a good guardrail against silent drift.
- Clean adherence to the project's pure/impure boundary: `lib/export/` imports nothing from Next, the DB or the SDK, and the one place it touches a mutable API (`exceljs` in `xlsx.ts`) is contained to a function that only writes to an in-memory buffer.

## Test coverage

Strong. `lib/export/format.test.ts`, `csv.test.ts`, `table.test.ts` and `xlsx.test.ts` cover the pure pieces in isolation (money edge cases including negative cents, RFC 4180 quoting, the formula guard, zero-findings tables, Summary pair ordering); `lib/audit/export.test.ts` covers the route handler end to end on in-memory SQLite (400/404/200 paths, the one-transaction snapshot via a `db.transaction` spy, the brief's acceptance numbers, and a full decisions round trip verified by reading the xlsx back with `exceljs`). The `export-menu.tsx` client component has no vitest test, which is consistent with this project's stated convention (`lib/` is TDD'd, UI is confirmed via `/check verify`) rather than a gap — and the session's `/check verify` run already confirmed it against every UI-facing AC.
