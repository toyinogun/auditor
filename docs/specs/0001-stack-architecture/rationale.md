# 0001. Stack and architecture: rationale

Decision record for [index.md](index.md). `/develop` does not need this file.

## Context

> ⚠️ Premise note: the brief's plan has 15 features in 2 to 3 evenings, including a k3s deploy. A self hosted cluster is normally too much for one person, but it already exists and is part of the portfolio story, so the cost here is one Dockerfile and a few manifests, not running a platform. The real schedule risk is scope, not stack: keep every layer to what a demo needs, and do not add infrastructure (queues, caches, object storage) that no measured problem asks for.

The product is a portfolio demo that must look and work like a real finance tool. It reads a dozen fictional supplier documents, extracts them with an LLM, runs six money checks in plain code, and lets an analyst approve findings and export a claim list. Scale is tiny (one visitor at a time, 12 documents), but correctness is exact: the audit must hit $9,766.85 to the cent every run.

The brief fixes most of the stack (Next.js, TypeScript, Tailwind, Zod, SQLite with Drizzle, exceljs, n8n, Vitest). It leaves open the model provider, the hosting target and the PDF text library, and says nothing about the SQLite driver, migrations, file storage, processing model, webhook auth, demo mode enforcement, config or logging. Left undecided, each would be invented partway through a build.

Hard constraints: documents go only to the model API and never to third party storage. The public demo must run with no visitor API key and must not let visitors send their own documents to the model. SQLite needs a lasting disk. One developer, working evenings.

## Options considered

### Option 1: Next.js monolith, SQLite on a k3s volume, Claude (chosen)

One container on the existing k3s cluster behind a Cloudflare Tunnel, SQLite on a persistent volume, extraction with Claude's forced tool choice.

**Pros**: every brief choice works as written; one process to debug; showcases your infra; forced tool choice and native PDF input fit the one call classify and extract design.
**Cons**: single replica and deploy downtime; you own the cluster and backups; native module build in Docker.

### Option 2: Next.js on Vercel with Turso (libSQL), Claude

Serverless hosting, with SQLite moved to hosted libSQL and uploads to object storage (Vercel has no lasting disk).

**Pros**: fastest deploy, preview URLs, no cluster to maintain.
**Cons**: adds two outside services (Turso, blob storage), which strains the "nothing to third party storage" rule; function time limits sit close to multi document extraction; a weaker infra story for clients.

### Option 3: Container on a small VPS or Fly.io, Claude

The same app and image as Option 1, run as a single Docker container with a mounted volume.

**Pros**: persistent disk, no cluster, very little to operate.
**Cons**: loses the k3s showcase you already have; another host to pay for and patch.

### Option 4: Provider neutral extraction via the Vercel AI SDK (Claude or Gemini)

Any hosting from above, with extraction behind one SDK so the model is an env var.

**Pros**: swap providers freely; a nice demo talking point.
**Cons**: an extra abstraction over tool choice and PDF input; hides provider features; one more layer to debug when an extraction is off by one digit.

## Rationale

The forces that decide it are the exact money result, the no third party storage rule, the tiny scale, and the time box. SQLite on a real disk keeps the brief's database choice with no hosted service, which rules out Vercel unless you add Turso and blob storage (Option 2), and that breaks the storage rule in spirit. Between the two container options, the image is the same, so k3s wins because the cluster already exists and demonstrates infrastructure skill to the clients this portfolio targets. Its main cost, a single replica with brief deploy downtime, does not matter for a demo.

Claude directly (not Option 4) because the whole extraction design depends on one provider feature: forcing exactly one of three tools per call, plus reading an image only PDF. Using the SDK directly keeps that visible and debuggable. Sonnet is the default because a single misread digit on the scanned invoice breaks the acceptance total, and 12 documents cost cents. The env override leaves room to try Haiku.

Smaller calls follow the same logic: better-sqlite3 (the most proven Drizzle SQLite driver; runner up libSQL in file mode, which avoids the native build but is async and slower), unpdf over pdf-parse (maintained, bundles cleanly), in request processing over a queue (no measured need), a shared secret header over HMAC (n8n sets it with no code), and committed migrations over `push` (analyst decisions must survive restarts).

Calls made while writing the spec (not asked separately):
- **Scan rendering for the generator**: `@napi-rs/canvas` draws the scanned invoice to a PNG, embedded by pdfkit. Prebuilt binaries, no system libraries. Runner up: render a text PDF to an image with pdf.js, which is more moving parts.
- **CSV writer**: a small built in RFC 4180 writer. Runner up: `csv-stringify`, which isn't needed for a single flat table.
- **Scan detection threshold**: treat a PDF as scanned when unpdf returns under about 20 non whitespace characters per page. Runner up: a per document flag in the sample manifest, which wouldn't work for real uploads.
- **Deploy strategy**: `Recreate` with one replica. Runner up: RollingUpdate, which would briefly run two SQLite writers on one volume.

## References

**Project sources**:
- `docs/brief.md`: the fixed stack, data handling rule, and acceptance numbers.
- `docs/scope/scope.md`: Feature 1, Skateboard approach, Alpha workflow, and the demo mode ground rule.
- User level skills `nextjs-patterns`, `shadcn-ui`, `testing-patterns`.

**Practices & standards**:
- Monolith first for a small team and small scale.
- Boring technology: a relational store on a local file, no infrastructure without a measured need.
- Single writer rule for SQLite (one replica, `Recreate` deploys).
- Constant time comparison for shared secrets.
- RFC 4180 for CSV quoting.

**Links** (checked during the landscape check on 2026-09-27):
- Next.js deploying docs (standalone output for Docker): https://nextjs.org/docs/app/getting-started/deploying
- shadcn/ui with Tailwind v4: https://ui.shadcn.com/docs/tailwind-v4
- Drizzle ORM SQLite: https://orm.drizzle.team/docs/sqlite/latest-releases
- unpdf on npm: https://www.npmjs.com/package/unpdf
- Anthropic TypeScript SDK: https://platform.claude.com/docs/en/cli-sdks-libraries/sdks/typescript
- Zod: https://zod.dev
- Vitest releases: https://github.com/vitest-dev/vitest/releases
- exceljs releases: https://github.com/exceljs/exceljs/releases
