# Verify: Stack & architecture · spec 0001 · updated 2026-09-27
_Steps derived from the scope's "Done when" for feature 1 (spec 0001 is a decision record with no numbered acceptance criteria). `/check verify` runs these; `/test` locks the durable ones. Run every command with Node 22 on the PATH._

## UI / manual
- [x] `pnpm dev`, open http://localhost:3000 → the page shows the heading "Overpayment Auditor" → DW-1 (boots locally)

## Commands
- [x] `node -v` → `v22.x`; `pnpm install` → finishes with no unsupported engine warning → DW-1
- [x] `pnpm typecheck` → exits 0 → DW-2 (passes build)
- [x] `pnpm build` → exits 0, and `.next/standalone/server.js` exists → DW-2
- [x] `next.config.ts` → has `output: "standalone"`, `serverExternalPackages: ["better-sqlite3"]`, and `serverActions.bodySizeLimit` set from `MAX_UPLOAD_MB` (default 10) → DW-3 (stack recorded matches the spec)
- [x] `package.json` → `engines.node` is `>=22 <23`, `packageManager` is set to a pnpm version, and `pnpm-lock.yaml` is present → DW-3
- [x] `.env.example` → lists `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `INGEST_SECRET`, `DATA_DIR`, `DEMO_MODE`, `MAX_UPLOAD_MB`; `git check-ignore data/x .env.local` → both ignored; `git check-ignore .env.example` → not ignored → DW-3
- [x] Code layout from spec 0001 exists: `app/`, `components/ui/`, `lib/{schemas,db,extract,checks,audit,ingest,export}/`, `scripts/generate-sample/`, `drizzle/`, `n8n/` → DW-3

## Acceptance-criteria coverage
- DW-1 (empty scaffold boots locally): covered by the dev server step and the install step
- DW-2 (passes build): covered by typecheck and build
- DW-3 (stack recorded, open choices made, scaffold follows the spec): covered by the config, package, env and layout steps
