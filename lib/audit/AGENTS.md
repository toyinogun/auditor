# lib/audit

Loads records, runs the checks and stores the findings (spec 0001 layout). The glue between `lib/db/` and the pure `lib/checks/`; it holds no audit logic of its own. Pipeline from [0004 six audit checks](../../docs/specs/0004-six-audit-checks/index.md); clean start from [0002 data model](../../docs/specs/0002-data-model/index.md).

## Files

- `run.ts`: `runAudit(db, clock)` runs `runChecks(loadAuditInput(db))` over whatever is stored, saves it with `saveAuditRun` (replacing earlier findings, keeping decisions) and returns `{ runId, summary }`.
- `sample.ts`: `runSampleAudit(db, clock, manifest)`, the offline audit and what "Load sample data" calls. In one transaction: `resetAll`, store the 14 sample documents with the real hashes from `public/sample/manifest.json`, save the fixture records via `briefSampleRecords`, then `runAudit`. A rerun replaces everything, decisions included; a throw rolls it all back.
- `scripts/audit-sample/index.ts` exposes it as `pnpm audit:sample` against `$DATA_DIR/auditor.db`.

## Conventions

- Every module starts with `import "server-only"`. Scripts that import it run under `tsx --conditions=react-server`.
- Functions take `db` first and a `clock` (`() => number`, default `Date.now`) last, read once for the start and once for the finish. Tests pass a fixed clock and an `openDb(":memory:")` database.
- The `lib/db` functions called inside `runSampleAudit`'s transaction open their own; better-sqlite3 runs them as savepoints, so pass the same `db` and never swap the driver without revisiting this.
- A save that fails on the committed sample is a bug, so it throws (`orThrow` from `lib/schemas/result.ts`).

_Drafted during the Feature 6 review, worth a quick human pass._
