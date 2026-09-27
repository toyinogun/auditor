# 0001. Stack and architecture for the overpayment auditor

**Date**: 2026-09-27
**Status**: Accepted

## Summary

This spec records the tech stack for the AI Invoice Overpayment Auditor and settles the few choices the brief left open. It is one Next.js app in TypeScript, keeping its data in a single SQLite file, reading documents with Claude, and running as one container on your k3s cluster behind a Cloudflare Tunnel. Everything runs inside one process (no queue, no extra services), so a 2 to 3 evening build stays realistic. Every later feature builds on this layout.

## Decision

**Chosen option**: Option 1: One Next.js monolith with SQLite on a persistent volume, Claude for extraction, hosted on k3s.

Build a single Next.js 16 App Router app (TypeScript, Node 22) with the domain logic in plain modules under `lib/`, SQLite through Drizzle and better-sqlite3, Claude through the Anthropic SDK, and one Docker container on k3s with the data on a persistent volume.

**Implementation skills**: `shadcn` (`shadcn-ui/ui`, `.claude/skills/shadcn/`) · `tailwind-v4-shadcn` (`secondsky/claude-skills`, `.claude/skills/tailwind-v4-shadcn/`; written for Vite, so take its `@theme` and CSS variable patterns, not its Vite config) · `n8n-workflow-lifecycle-official` (`n8n-io/skills`, `.claude/skills/n8n-workflow-lifecycle-official/`) · `nextjs-patterns` (user skill, `~/.claude/skills/nextjs-patterns/`) · `testing-patterns` (user skill, `~/.claude/skills/testing-patterns/`) · `claude-api` (built in, SDK usage and model ids)

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Proposed stack

| Layer | Choice | Reason |
|---|---|---|
| Pattern | One modular monolith (a single deployable app, split into clear internal modules) | One developer, a sample data demo and a short time box; nothing here justifies a second service. |
| Language & runtime | TypeScript with `strict` on, Node 22 LTS | Fixed by the brief; Node 22 is a safe LTS for native modules like better-sqlite3. |
| Package manager | pnpm | Fast, strict dependency handling, and common in Next.js repos. |
| Framework | Next.js 16 App Router, `output: "standalone"`, Node runtime on every server route (never the edge runtime) | Fixed by the brief. Standalone output gives a small Docker image; SQLite and PDF parsing need Node, not edge. |
| Styling & components | Tailwind CSS v4 + shadcn/ui (Radix based components copied into `components/ui/`) | Accessible tables, dialogs and sheets you own and restyle; Feature 9 tunes the tokens. |
| Schemas & validation | Zod 4, one schema per document type in `lib/schemas/` | One source of truth: the same schema becomes the Claude tool input (via `z.toJSONSchema()` with refs inlined and `unrepresentable: "any"`) and validates the tool result. Feature 7 smoke tests one real tool call with the generated schema before relying on it. |
| LLM | `@anthropic-ai/sdk`, default model `claude-sonnet-5`, overridable with `ANTHROPIC_MODEL` | Forced tool choice (`tool_choice: { type: "any", disable_parallel_tool_use: true }` over the three `record_*` tools) makes one call both classify and extract; a response with anything other than exactly one `tool_use` block is rejected. Native PDF `document` blocks read the scanned invoice. |
| PDF text | `unpdf` | Maintained, no native deps. Empty or near empty extracted text marks a document as a scan, which is then sent to Claude as a PDF file instead of text. |
| Primary DB | SQLite file via `better-sqlite3` + Drizzle ORM, WAL mode on (write ahead logging, so reads never block the one writer) | Fixed by the brief. A relational store fits invoices, lines, contracts and findings; one file on a volume, nothing to operate. |
| Migrations | `drizzle-kit generate`, SQL committed in `drizzle/`, applied at server start with Drizzle's `migrate()`, called from `instrumentation.ts` `register()` (guarded by `process.env.NEXT_RUNTIME === "nodejs"`) | Reviewed history in git, and the pod needs no manual step. Tests apply the same migrations to an in memory DB. |
| File storage | Local disk on the same volume: `${DATA_DIR}/uploads/<sha256>.<ext>` | The brief forbids third party storage. The hash doubles as the dedupe key when the same file arrives by upload and by n8n. |
| Background jobs | None. Ingest extracts and re audits inside the request; each document has a `status` column (`queued`, `extracting`, `done`, `failed`) | 12 documents at a few seconds each needs no queue. |
| Server surface | Route Handlers for machines: `POST /api/ingest`, `GET /api/export?format=xlsx\|csv`. Server Actions for the UI: approve, reject, load sample data, upload | n8n and file downloads need real HTTP; UI mutations skip a hand written fetch layer. |
| Auth | No user accounts (out of scope for v1). The webhook needs an `X-Ingest-Secret` header, checked with a constant time compare against `INGEST_SECRET` | Enough for a demo. Browser uploads go through a Server Action, so the secret never reaches the client. |
| Demo mode | `DEMO_MODE=true` checked server side only. Browser uploads are accepted only when the file's SHA-256 matches a known sample file. "Load sample data" uses the offline structured copies with no model call | Visitors need no key and cannot send outside documents to the model. The webhook still works with the secret. |
| Export | `exceljs` for `.xlsx`; a small built in CSV writer (RFC 4180 quoting) for `.csv` | Fixed by the brief for xlsx. CSV is simple enough that another dependency buys nothing. |
| Sample data generator | `pdfkit` for the text PDFs. The scanned invoice is drawn to a PNG with `@napi-rs/canvas` (slight tilt and grain), then embedded with pdfkit as the page's only content, so it has no text layer. Fixed PDF metadata dates, so output is identical on every run | Simple drawing for invoice tables, prebuilt canvas binaries with no system libraries, and a true image only scan. |
| Intake | n8n workflow: Google Drive trigger → HTTP Request to `/api/ingest` with the secret header, committed as `n8n/intake.json` | Fixed by the brief. |
| Tests | Vitest, pure check tests with fixture data, plus DB tests on in memory SQLite | Fixed by the brief. The $9,766.85 acceptance test runs with no network. |
| Config | One Zod schema in `lib/env.ts`, parsed once at startup | Fails fast with a clear message. `ANTHROPIC_API_KEY` is optional when `DEMO_MODE=true`. |
| Logging | `lib/log.ts`: one JSON line per event (ingest, extraction result or failure, audit run totals) | Readable in `kubectl logs`, no dependency. Never logs document contents or secrets. |
| Hosting | One Docker image (multi stage, standalone output, `node:22-bookworm-slim` for build and run, never Alpine, because better-sqlite3's prebuilt binaries need glibc) on your k3s cluster, exposed through a Cloudflare Tunnel. A single replica with the `Recreate` update strategy (the old pod stops before the new one starts) and a ReadWriteOnce PersistentVolumeClaim mounted at `/data` on a `local-path` or block storage class, never NFS (SQLite with WAL is unsafe on network file systems) | SQLite needs a lasting disk and a single writer. The cluster already exists, and showing it is part of the portfolio story. Manifests and tunnel details belong to Feature 14. |
| CI | None for now. Typecheck, lint and tests run locally | Your call, to save time. See Follow-up. |
| Lint & format | Decided by `/audit` (Feature 2) | Out of scope here. |

### Code layout

```
app/                     routes and pages (review screen, landing, api/ingest, api/export)
components/ui/           shadcn components
lib/
  env.ts                 Zod parsed config
  log.ts                 JSON logger
  schemas/               Zod schemas per document type (shared by extract, checks, generator)
  db/                    Drizzle schema, client, queries
  extract/               unpdf text read, scan detection, Claude call, validation
  checks/                the six pure check functions (no Next, DB or network imports)
  audit/                 loads records, runs the checks, stores findings
  ingest/                file intake shared by the Server Action and /api/ingest
  export/                xlsx and csv writers
scripts/generate-sample/ sample PDFs, CSVs and structured copies
drizzle/                 committed migrations
n8n/intake.json          the intake workflow
data/                    local DB and uploads (gitignored; /data on k3s)
```

### Boundaries the build must hold

- `lib/checks/` is pure: plain data in, findings out. It never imports Next, the DB, the SDK or `fetch`. The LLM never computes a money amount.
- Only `lib/extract/` talks to Claude. Only `lib/db/` talks to SQLite.
- Every server route and action runs on the Node runtime.
- `better-sqlite3` is listed in `serverExternalPackages` in `next.config.ts`, and built for the image's Node version in the Docker build stage. That alone is not trusted: the Dockerfile copies `node_modules/better-sqlite3` into `.next/standalone/node_modules/` and runs `node -e "require('better-sqlite3')"` in the run stage so a missing `.node` binary fails the build.
- Upload size: `experimental.serverActions.bodySizeLimit` in `next.config.ts` is set from `MAX_UPLOAD_MB` (the default is only 1 MB). `/api/ingest` gets no framework limit, so it checks `Content-Length` and the file size against `MAX_UPLOAD_MB` itself before reading the body.
- Versions: install the latest stable release of each package at scaffold time and commit the lockfile. Pin `"engines": { "node": ">=22 <23" }` and `"packageManager": "pnpm@<version>"` in `package.json` so local dev and the Docker build match. The majors above were current on 2026-09-27; check them again when you scaffold.

### Configuration required

- `ANTHROPIC_API_KEY`: Claude access, server only. Optional when `DEMO_MODE=true`.
- `ANTHROPIC_MODEL`: extraction model id, default `claude-sonnet-5`.
- `INGEST_SECRET`: shared secret the n8n webhook sends in `X-Ingest-Secret`.
- `DATA_DIR`: folder for `auditor.db` and `uploads/`, default `./data` (`/data` on k3s).
- `DEMO_MODE`: `true` on the public demo, which limits uploads to the sample files.
- `MAX_UPLOAD_MB`: per file upload limit, default `10`.

## Consequences

**Positive**:
- One process, one file database, no queue: easy to run locally (`pnpm dev`) and easy to reason about.
- The audit engine is plain TypeScript, so it is fully testable offline, which is the heart of the demo.
- The same Zod schemas drive the generator, extraction and the checks, so the three can't drift apart.

**Negative / tradeoffs**:
- SQLite plus one pod means a single replica and a short outage during each deploy (`Recreate`). Fine for a demo; moving to Postgres would be needed before you scale out.
- Extraction in the request makes an upload take several seconds. The UI must show progress, and a pod restart mid extraction leaves a document in `extracting`, which needs a retry path (Feature 8).
- better-sqlite3 is a native module: the Docker build must compile it for the target platform (arm64 vs amd64 on your nodes).
- Running k3s yourself means you own the cluster's uptime and the backups of the volume.
- No CI means nothing guards the $9,766.85 test on push; a broken commit can reach the public repo.
- No logins: anyone with the demo URL can approve or reject findings, which changes what the next visitor sees (see Follow-up).

**Neutral**:
- Tailwind v4 is configured in CSS (`@theme`), not `tailwind.config.js`.
- Moving hosting to Vercel later would mean swapping the driver to libSQL/Turso and moving uploads to object storage.

## Follow-up

- [ ] Data model (Feature 3): decide the money representation. Recommended: integer cents, with rates in basis points, so $9,766.85 never drifts.
- [ ] Review screen (Feature 10): decide whether demo visitors share one audit run or each get their own copy, since there are no logins.
- [ ] Upload & ingest (Feature 8): define the retry for a document stuck in `extracting` after a restart.
- [ ] Public demo deploy (Feature 14): Dockerfile, k3s manifests, PVC size, tunnel route, image registry, and volume backup.
- [ ] CI was skipped on purpose. Consider GitHub Actions (typecheck, test, build) before the repo goes public; a green badge helps with clients.
- [ ] No root `AGENTS.md` exists yet. `/audit` (Feature 2) should create it from the scaffold and record this stack, the code layout and the boundaries above.
- [ ] `AGENTS.md` `## Agent skills` (for `/audit`): record the installed `shadcn`, `tailwind-v4-shadcn` (project wide, root) and `n8n-workflow-lifecycle-official` (area specific, `n8n/AGENTS.md`). Under `Declined:` list `drizzle-sqlite`, `better-sqlite3-rebuild`, `vitest`, `zod` and `exceljs` skills, so they aren't offered again.
