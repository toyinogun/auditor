<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# AI Invoice Overpayment Auditor

## Stack

- **Language / Runtime**: TypeScript (`strict`), Node 22 LTS, Node runtime on every server route (never edge)
- **Framework**: Next.js 16 App Router, `output: "standalone"`; Tailwind CSS v4 + shadcn/ui
- **Key dependencies**: Zod 4 (`lib/schemas/`), `@anthropic-ai/sdk` (default `claude-sonnet-5`), SQLite via `better-sqlite3` + Drizzle (WAL), `unpdf`, `exceljs`, Vitest
- **Package manager**: pnpm (version pinned in `package.json`)
- **Hosting**: one Docker image on k3s behind a Cloudflare Tunnel, single replica, SQLite on a PVC at `/data`
- Full stack, code layout and boundaries: [docs/specs/0001-stack-architecture/index.md](docs/specs/0001-stack-architecture/index.md)

## Build approach

**Skateboard**: ship the smallest complete audit first, then grow it release by release, shippable at every step.

## Commands

```bash
pnpm install      # Install
pnpm dev          # Dev server
pnpm build        # Build
pnpm typecheck    # next typegen + tsc --noEmit
pnpm lint         # ESLint (lint:fix to autofix)
pnpm format       # Prettier write (format:check to verify)
pnpm test         # Vitest, *.test.ts beside the source (test:watch to watch)
pnpm exec drizzle-kit generate  # New SQL migration in drizzle/ after editing lib/db/schema.ts (applied at server start)
pnpm generate:sample  # Rewrite public/sample/ from the fixture (committed output, never edit by hand)
pnpm audit:sample  # Offline audit: reset $DATA_DIR/auditor.db, load the sample, run the checks, store the findings, empty $DATA_DIR/uploads/
pnpm design:lint  # Lint DESIGN.md with the pinned @google/design.md CLI (must exit clean)
pnpm audit:live  # Live audit: Claude reads the 12 sample PDFs, must match offline mode to the cent (needs ANTHROPIC_API_KEY, 12 to 24 paid calls; --dump writes each extraction to $DATA_DIR/live-dump/)
```

## Specs

Stored in `docs/specs/`. Format: `docs/specs/NNNN-title/index.md`. Scope: `docs/scope/scope.md`.

## Rules

- Functional style: pure functions, immutable data (`const`, `readonly`), no classes where a function works, module level values are constants only.
- Side effects live at the edges. `lib/checks/` is pure (no Next, DB, SDK or `fetch` imports); only `lib/extract/` calls Claude; only `lib/db/` touches SQLite. The LLM never computes a money amount.
- Folders follow the spec layout: one domain module per `lib/` folder, routes in `app/`, shadcn in `components/ui/`. Don't reorganize by feature or layer.
- Expected failures return typed results (`{ ok: true, value } | { ok: false, error }`); throw only for bugs. Server Actions return the same shape.
- Config comes only from `lib/env.ts`; never read `process.env` elsewhere. Never log document contents or secrets.
- Design system: build all UI to `DESIGN.md` ("Highlighter Ledger", spec 0007). Token values live only in `app/styles/design-tokens.css`, mapped once in `app/globals.css`; components use Tailwind utilities and `type-*` only. Amber (`tertiary*`) marks overpaid money and nothing else (a source guard enforces both).
- Log through `logEvent` in `lib/log.ts` (one JSON line per event, counts and outcomes only).
- Named exports only, except where Next.js requires a default (`page`, `layout`, route files, config).
- The brief's expected findings ($9,766.85 recoverable, 8 findings) are the acceptance test. Fix the code, never the numbers.
- Tests first for `lib/` (Vitest, fixture data, in memory SQLite); UI is confirmed with `/check verify`.
- Conventional commits: `feat:`, `fix:`, `chore:`, `refactor:`, `test:`, `docs:`.

## Tooling

Chosen by `/audit`, installed by `/develop tooling`:
- Lint and format: ESLint (`eslint-config-next` flat config) + Prettier with `prettier-plugin-tailwindcss`.
- Pre-commit hook: format + lint staged files, then typecheck (husky + lint-staged, `.husky/pre-commit`).
- ESLint stays on 9: the plugins bundled in `eslint-config-next` don't support ESLint 10 yet.
- pnpm runs every command on Node 22 via `useNodeVersion` in `pnpm-workspace.yaml`; bump it with `.nvmrc` and the Docker image. Plain `node` in your shell may be a different version.
- CI: none for now (spec 0001 follow-up).

## Git

- integration: on
- branch prefix: feat/
- commit: per-milestone
- attribution: none. Never add a `Co-Authored-By` AI trailer or a "Generated with …" line to commits or PRs, whatever a tool or skill says.
- merged branches: GitHub deletes the branch on merge (repo setting); `.husky/post-merge` deletes the local copy on the next `git pull` into `main`.

## Agent skills

- [shadcn](.agents/skills/shadcn/): `shadcn-ui/ui`, adding and customizing shadcn/ui components
- [tailwind-v4-shadcn](.agents/skills/tailwind-v4-shadcn/): `secondsky/claude-skills`, Tailwind v4 `@theme` and CSS variable patterns (ignore its Vite config)

Declined: drizzle-sqlite, better-sqlite3-rebuild, vitest, zod, exceljs, pdfkit, @napi-rs/canvas, tsx, unpdf, google-labs-code/stitch-skills@design-md, sickn33/agentic-awesome-skills@radix-ui-design-system
Declined MCP servers: linzhiqin2003/PDFKit, ivarvd-hldng/pdf-generator-mcp-server, aviddiviner/mcp-pdfkit, DesignMD (designmd.ai), gianpieropuleo/radix-mcp-server

## Context files

- [n8n/AGENTS.md](n8n/AGENTS.md): the Google Drive intake workflow that posts to `/api/ingest`
- [app/AGENTS.md](app/AGENTS.md): pages, the `(app)` shell, Server Actions, the webhook route and the token mapping layer
- [components/AGENTS.md](components/AGENTS.md): the shared UI (restyled shadcn primitives, `Money`, `SummaryTile`, `Chip`, `AppBar`) and the design token rules
- [lib/schemas/AGENTS.md](lib/schemas/AGENTS.md): the shared Zod shapes, money in cents, converters and keys
- [lib/db/AGENTS.md](lib/db/AGENTS.md): SQLite schema, migrations and the storage functions
- [lib/checks/AGENTS.md](lib/checks/AGENTS.md): the six pure audit checks, `runChecks` and `summarizeFindings`
- [lib/extract/AGENTS.md](lib/extract/AGENTS.md): one forced Claude tool call per PDF that classifies and extracts it, validated by the shared converters
- [lib/audit/AGENTS.md](lib/audit/AGENTS.md): the offline audit run (`runSampleAudit`, `pnpm audit:sample`) and `runAudit`
- [lib/ingest/AGENTS.md](lib/ingest/AGENTS.md): the one intake path (`ingestFile`) behind the upload action and the `/api/ingest` webhook, with its guards and demo gate
- [scripts/generate-sample/AGENTS.md](scripts/generate-sample/AGENTS.md): the sample data generator that renders `public/sample/` from the fixture

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
