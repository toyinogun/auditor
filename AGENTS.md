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
# Test: runner set up by /test
```

## Specs

Stored in `docs/specs/`. Format: `docs/specs/NNNN-title/index.md`. Scope: `docs/scope/scope.md`.

## Rules

- Functional style: pure functions, immutable data (`const`, `readonly`), no classes where a function works, module level values are constants only.
- Side effects live at the edges. `lib/checks/` is pure (no Next, DB, SDK or `fetch` imports); only `lib/extract/` calls Claude; only `lib/db/` touches SQLite. The LLM never computes a money amount.
- Folders follow the spec layout: one domain module per `lib/` folder, routes in `app/`, shadcn in `components/ui/`. Don't reorganize by feature or layer.
- Expected failures return typed results (`{ ok: true, value } | { ok: false, error }`); throw only for bugs. Server Actions return the same shape.
- Config comes only from `lib/env.ts`; never read `process.env` elsewhere. Never log document contents or secrets.
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

## Agent skills

- [shadcn](.agents/skills/shadcn/): `shadcn-ui/ui`, adding and customizing shadcn/ui components
- [tailwind-v4-shadcn](.agents/skills/tailwind-v4-shadcn/): `secondsky/claude-skills`, Tailwind v4 `@theme` and CSS variable patterns (ignore its Vite config)

Declined: drizzle-sqlite, better-sqlite3-rebuild, vitest, zod, exceljs

## Context files

- [n8n/AGENTS.md](n8n/AGENTS.md): the Google Drive intake workflow that posts to `/api/ingest`

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
