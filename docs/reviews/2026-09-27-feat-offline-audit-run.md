# Review, feat/offline-audit-run, 2026-09-27

**Reviewed by**: Claude Sonnet 5 (author on Claude Sonnet 5)
**Scope**: 7 files, branch vs `main` (merge base `2d65da1`)
**Verdict**: Approve with nits

## Summary
Feature 6 (offline audit run) wires the sample loader to `runChecks`/`saveAuditRun`: `lib/audit/run.ts` runs the checks over stored records and saves the run; `lib/audit/sample.ts` clears storage, loads the brief sample from the real `public/sample/manifest.json` via `briefSampleRecords(refFor)`, and runs the audit, all inside one transaction. `scripts/audit-sample/index.ts` exposes it as `pnpm audit:sample`. The implementation is small, correctly scoped, and matches the spec's suggested pipeline (`runChecks(loadAuditInput(db))` then `saveAuditRun`) almost verbatim. I ran `pnpm audit:sample` twice against the real SQLite database and confirmed the acceptance numbers exactly, confirmed typecheck/lint are clean, and confirmed the rollback-on-failure test genuinely exercises a mid-transaction throw. No blockers or majors; a couple of minor documentation/robustness notes below.

## Minor
### 🟡 Nested `db.transaction` relies on undocumented native fallback, `lib/audit/sample.ts:103`
**Problem**: `runSampleAudit` opens `db.transaction(() => { ... })` but the callback ignores the `tx` handle drizzle passes in and closes over the outer `db` instead; `resetAll(db)` and (via `runAudit`) `saveAuditRun(db, ...)` then each call `db.transaction(...)` again on that same outer `db`. This works only because better-sqlite3's native `Database.prototype.transaction` checks `db.inTransaction` and silently switches to `SAVEPOINT`/`RELEASE`/`ROLLBACK TO` when already inside a transaction (confirmed by reading `better-sqlite3/lib/methods/transaction.js` and by the passing "keeps the previous data when the load fails partway" test, which really does roll back a partial write).
**Why it matters**: The correctness depends on an implementation detail of the underlying driver rather than drizzle's own nested-transaction support (`BetterSQLiteTransaction.transaction`, which the codebase already types via the `Tx` alias in `lib/db/records.ts`). It works today, but nothing in the code signals *why* it's safe, so a future edit that swaps drivers, or "fixes" the seemingly-unused `tx` parameter by threading it through instead, could silently break atomicity without a visible diff.
**Suggested fix**: A short comment on `runSampleAudit` (and/or `resetAll`/`saveAuditRun`) noting that nested `db.transaction()` calls are intentionally safe because better-sqlite3 promotes them to savepoints when already inside a transaction, so future readers don't "fix" it.

### 🟡 `lib/audit/` has no `AGENTS.md`, `lib/audit/AGENTS.md`
**Problem**: Every other domain folder this feature touches (`lib/db`, `lib/checks`, `lib/schemas`) has its own `AGENTS.md`, and the root `AGENTS.md`'s "Context files" list enumerates each one. `lib/audit/` and `scripts/audit-sample/` are new and appear in neither.
**Why it matters**: Minor only because this is normally filled in by `/sync` after merge, not by `/develop` itself, and the root `AGENTS.md` explicitly is a living document meant to be updated that way. Flagging so it doesn't get missed.
**Suggested fix**: Run `/sync` (or add a short `lib/audit/AGENTS.md` and a root `AGENTS.md` context-files line) before/after merge.

## Nits
- ⚪ `lib/audit/sample.ts:27`, `orThrow` duplicates the identically named helper in `lib/schemas/fixtures/brief-sample-records.ts` (and the near-identical `unwrap` in `lib/db/testing.ts`). Harmless, not worth a shared export for three call sites.
- ⚪ `lib/db/testing.ts`'s `seedBriefSample` (untouched by this diff) still hand-converts records and fabricates document metadata instead of reusing `briefSampleRecords`, which spec 0004's follow-up note suggested; `lib/audit/sample.ts` does this the "right" way with real manifest data, so the two loaders have now diverged a bit further. Out of scope for this PR since the file isn't touched, but worth a follow-up.

## Strengths
- Verified end-to-end, not just unit-tested: ran `pnpm audit:sample` twice against the real `data/auditor.db` and got exactly 8 findings / $9,766.85 recoverable both times, with `audit_runs` staying at one row (replace, not duplicate) — matching the feature's "Done when" criteria precisely.
- The rollback test (`sample.test.ts`, "keeps the previous data when the load fails partway") exercises a genuine mid-transaction failure and asserts the database is untouched, rather than just asserting the throw.
- Clean separation of concerns: `runAudit` (pure "run checks + save" orchestration, reusable from anywhere records already exist) is decoupled from `runSampleAudit` (adds the sample-loading step); the `--conditions=react-server` flag on the new `audit:sample` script is exactly what's needed for the `server-only` guard in `lib/audit/sample.ts` to resolve outside Next, and was confirmed to work by direct execution.
- Typecheck and lint are both clean on the branch.

## Test coverage
Good. `run.test.ts` covers the checks-and-save path against a seeded database (matching the acceptance numbers) and an empty-database run. `sample.test.ts` covers the full acceptance criteria (8 findings, $9,766.85), that every manifest file is stored with its real hash/metadata, that a second run replaces rather than duplicates, that decisions are cleared on reset, and that a partial failure leaves prior data intact. No untested branching logic of note.
