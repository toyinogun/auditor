# Review, feat/data-model, 2026-09-27

**Reviewed by**: Claude Sonnet 5 (author on Claude Sonnet 5)
**Scope**: 39 files (plus lockfile and 3 deleted `.gitkeep`), branch vs `main`
**Verdict**: Approve with nits

## Summary
This change lands spec 0002: the three Zod shape layers (extraction, records, findings/decisions), the pure money and key helpers, the 15 table Drizzle schema with its first migration, and the database layer (documents, records, audit runs, decisions, reset). The code is careful and exactly matches the spec: money is integer cents everywhere, the arithmetic guard in `convert.ts` enforces every AC-5 rule, the schema's CHECK constraints mirror the Zod rules, and the migration file matches `schema.ts` column for column. All 130 tests pass, `pnpm typecheck` and `pnpm lint` are clean, and I independently re-ran the suite to confirm. The only things worth fixing are small: one file skips a documented guard, one pure helper has no direct test, and a tiny formatter is duplicated across two files.

## Minor
### 🟡 `lib/db/client.ts` has no `server-only` guard, `lib/db/client.ts:1`
**Problem**: The spec's Security model says "every function here is server only... add `import "server-only"` to its entry files," and the Critical test scenarios section states "`lib/db/` imports `server-only`, so a client import fails the build." `admin.ts`, `audit.ts`, `documents.ts` and `records.ts` all import `server-only` at the top; `client.ts`, the module that exports `openDb`/`getDb` and is the most likely thing a future Server Action or route handler imports directly, does not.
**Why it matters**: Today nothing imports `client.ts` from a client component, so there's no live bug, and Next would still fail to bundle `node:fs`/`better-sqlite3` into a client bundle either way. But the failure would come from an obscure webpack resolution error instead of the clear "You're importing a server-only module" message the rest of `lib/db/` is designed to give, and it leaves the module least protected that Feature 8 (ingest) is most likely to import directly.
**Suggested fix**: Add `import "server-only";` as the first line of `lib/db/client.ts`, matching the other four files.

### 🟡 `formatBps` has no direct test, `lib/schemas/money.ts:55`
**Problem**: `formatBps` is new logic exported from `money.ts`. It's used inside an error message in `convert.ts:142`, but every test that reaches that code path only asserts `.toContain("charge 1")`, never the formatted percentage text itself. `money.test.ts` tests `parseMoney`, `parseRate`, `percentOfCents` and `formatCents`, but not `formatBps`.
**Why it matters**: It's a one line pure function and low risk, but per the test signal (`configured`), new logic without a direct assertion is exactly the gap this project's testing convention exists to catch, and a sign flip or division bug here would currently pass every test.
**Suggested fix**: Add a couple of `it.each` cases to `money.test.ts` alongside `formatCents`, e.g. `formatBps(250)` → `"2.5%"`, `formatBps(10000)` → `"100%"`.

## Nits
- ⚪ `lib/schemas/convert.ts:43` and `lib/db/audit.ts:130` each define their own near identical `describeIssues(error: z.ZodError): string` helper (differing only in the default path label). Worth factoring into one shared helper, e.g. in `lib/schemas/result.ts`, since both already import from `lib/schemas/`.

## Strengths
- The arithmetic guard in `lib/schemas/convert.ts` (line, subtotal, rated charge and total checks) reads exactly like spec AC-5, and every rule has a test that fails naming the right line, charge or field.
- The Drizzle schema's CHECK constraints (`invoice_charges_surcharge_type_check`, `decisions_reason_check` with its explicit `IS NOT NULL`, the contract term check) are a careful, faithful translation of the spec's invariants into the database, and `lib/db/client.test.ts` proves each one at the SQLite level rather than only in Zod.
- `lib/db/testing.ts` + the round trip test in `lib/db/records.test.ts` (`loadAuditInput` deep-equal to the converted records) gives real confidence that the offline and stored paths can't silently drift, which is the whole point of this spec.

## Test coverage
Thorough and well targeted: money parsing/rounding boundaries, every AC-5 arithmetic failure mode, quantity and currency rejection, supplier key normalization (including the "Inc." merge case), contract overlap (three boundary cases plus two acceptances), duplicate `sha256`, duplicate `finding_key`, blank reject reason (Zod and DB CHECK both), saveAuditRun's replace-in-one-transaction and rollback-on-bad-finding behavior, and decide()'s pending/approved/rejected/amount-changed states are all covered with specific assertions, not just success/failure booleans. The two gaps are the `server-only` guard on `client.ts` (nothing to test in Vitest, it's a build-time guarantee) and the untested `formatBps`, both called out above.
