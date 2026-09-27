# Scope: AI Invoice Overpayment Auditor

A web app that finds money a company has overpaid its suppliers: an LLM reads invoices, contracts and purchase orders, plain code checks every invoice against the contract, goods received and the payment ledger, and an analyst approves each finding and exports a claim list. It is a portfolio project for finance and AP teams, procurement and recovery audit firms, shown to clients on Upwork, and it runs only on the fictional sample data in `docs/brief.md`.

**Build approach:** Skateboard (ship the smallest complete audit first, then grow it release by release, shippable at every step).
**Workflow:** Alpha (after `/develop`, run `/check verify`). The project default level of rigor. `/architect` is the recommended first stop for a feature with a real decision, but skippable when you already know the build. Any feature can carry its own tag (e.g. `· Beta`) to do more or less.

**Ground rules from the brief (fixed):**
- The stack in `docs/brief.md` is decided. Specs record it and only settle what the brief leaves open.
- The "Expected findings" table in the brief is the acceptance test: 8 findings, $9,766.85 recoverable, 18.1% of $53,939.60 invoiced. Never change those numbers to make something pass; fix the code instead.
- The sample data generator and the six checks (with tests hitting $9,766.85) come before LLM extraction and before any UI.
- The public demo uses sample data only: visitors press "Load sample data", need no API key, and cannot send in their own documents.
- Time box: a public demo in 2 to 3 evenings.

_These are recommendations to keep your build orderly, not requirements. Skip anything that does not fit: if you already know how to build a feature, use `/develop` and skip `/architect`. You decide when a feature is `done`._

## At a glance

| # | Feature | Phase | Status |
|---|---------|-------|--------|
| 1 | Stack & architecture | Foundation | done |
| 2 | Coding standards & tooling | Foundation | done |
| 3 | Data model | Foundation | done |
| 4 | Sample data generator | Release 1 | done |
| 5 | Six audit checks | Release 1 | done |
| 6 | Offline audit run | Release 1 | done |
| 7 | LLM classify & extract | Release 2 | done |
| 8 | Upload & ingest | Release 2 | done |
| 9 | Design system & UI foundation | Release 3 | done |
| 10 | Review screen | Release 3 | done |
| 11 | Export | Release 3 | in-progress |
| 12 | n8n Drive intake | Release 4 | planned |
| 13 | Landing page & social card | Release 4 | planned |
| 14 | Public demo deploy | Release 4 | planned |
| 15 | Portfolio packaging | Release 4 | planned |

## Foundations

### 1. Stack & architecture · done
Record the stack the brief already fixes, settle the few choices it leaves open (which model provider, which hosting target), and scaffold a runnable project so every later release builds on real structure.
**Done when:** the stack is recorded in a spec, the open choices are made, and the empty scaffold boots locally and passes build.
spec [0001](../specs/0001-stack-architecture/index.md) · code in `/` (repo root: `app/`, `lib/`, `next.config.ts`)
- [x] Decide the stack (spec): `/architect stack & architecture`
- [x] Scaffold from the decision: `/develop stack & architecture`
- [x] Verify it: `/check verify stack & architecture`

### 2. Coding standards & tooling · done
Capture conventions from the real scaffolded project, then install lint, format, type strictness and test running so every later feature follows them.
**Done when:** root `AGENTS.md` reflects the real stack, and lint, format, typecheck and the test runner all run clean.
- [x] Capture conventions + tooling choices: `/audit`

### 3. Data model · done
The shared shapes every feature leans on: documents, extracted invoices, contracts and purchase orders with their lines, receipts, payments, findings with evidence, and analyst decisions. These shapes are the contract between the generator, the LLM extraction and the checks, so they come first.
**Done when:** one set of validated shapes covers every field the six checks and the evidence line need, money is stored without rounding drift, and the sample data fits them with no special cases.
spec [0002](../specs/0002-data-model/index.md) · code in `lib/schemas/`, `lib/db/`, `drizzle/`
- [x] Design it (spec): `/architect data model`
- [x] Build it: `/develop data model`
  - [x] Money helpers, document shapes and converters with the arithmetic guard (AC-1 to AC-6)
  - [x] Keys and finding shapes: supplier and invoice number keys, finding key, evidence, decision (AC-9, AC-13)
  - [x] Database schema, first migration and client with WAL and foreign keys (AC-7)
  - [x] Record, audit run and decision storage with reset (AC-8 to AC-15)
- [x] Verify it: `/check verify data model`

## Release 1: Offline audit engine (the skateboard)

The smallest complete audit: fictional documents go in, the checks run with no API key, and the finding log matches the brief to the cent.

### 4. Sample data generator · done
A script that produces the brief's fictional world exactly: 12 real PDFs (2 contracts, 4 purchase orders, 6 invoices), `receipts.csv`, `ap_payments.csv`, and a `manifest.json` listing each file. The structured copy for offline mode is the existing fixture (`lib/schemas/fixtures/brief-sample.ts`) that every PDF is rendered from.
**Done when:** running the script writes all 12 PDFs and both CSVs with the brief's exact figures, at least one invoice is an image only scan with no text layer, and the output is identical on every run.
spec [0003](../specs/0003-sample-data-generator/index.md) · code in `scripts/generate-sample/`, `lib/schemas/sample-manifest.ts`, `public/sample/`
- [x] Design it (spec): `/architect sample data generator`
- [x] Build it: `/develop sample data generator`
  - [x] Dependencies, fonts, `generate:sample` command, manifest schema and the fixture guard (AC-2, AC-8)
  - [x] Thin whole: text invoices, CSVs, manifest and the atomic folder swap, with read back tests (AC-1, AC-3, AC-6, AC-7, AC-9)
  - [x] Purchase order and contract layouts with pinned clause wording (AC-3, AC-5, AC-9)
  - [x] NL88310 image only scan (AC-4, AC-8)
  - [x] Commit `public/sample/` and the drift test (AC-1, AC-7)
- [x] Verify it: `/check verify sample data generator`

### 5. Six audit checks · Beta · done
The six checks as pure functions (contract price, duplicates against the ledger, quantity received, surcharges, freight, missing PO or contract price), each finding carrying its amount, a one line calculation and the file and clause behind every figure. The LLM never calculates money.
**Done when:** tests assert all 8 expected findings and the $9,766.85 total (18.1% of $53,939.60), NL-88121 comes back clean, the duplicate NL88310's own price and freight issues are not counted a second time, and every finding shows its calculation and sources.
spec [0004](../specs/0004-six-audit-checks/index.md) · code in `lib/checks/`, `lib/schemas/fixtures/brief-sample-records.ts`, `lib/db/audit.ts`
- [x] Design it (spec): `/architect six audit checks`
- [x] Build it: `/develop six audit checks`
  - [x] Fixture records, lookup context, evidence helpers and the lint purity guard (AC-15)
  - [x] Duplicates, summary, `runChecks` pipeline, full acceptance test written, `saveAuditRun` recover only total (AC-2, AC-4 to AC-6)
  - [x] Contract price, missing reference and quantity received checks (AC-9, AC-10, AC-13)
  - [x] Surcharge and freight checks; acceptance test green, evidence, key, schema and shuffle tests (AC-1, AC-3, AC-7, AC-8, AC-11, AC-12, AC-14)
- [x] Verify it: `/check verify six audit checks`
- [x] Test it: `/test six audit checks`

### 6. Offline audit run · done
Load the structured sample records into storage, run the checks, and save the findings, so the whole audit works end to end with no API key. This is what "Load sample data" will call later.
**Done when:** one command (or call) loads the sample, runs the audit and stores 8 findings totalling $9,766.85; running it again replaces the run instead of duplicating it.
code in `lib/audit/`, `scripts/audit-sample/` (`pnpm audit:sample`)
- [x] Build it: `/develop offline audit run`

## Release 2: Real documents through the LLM

The same audit, now reading the actual PDFs.

### 7. LLM classify & extract · done
One model call per document with one tool per document type, so a single call both classifies and extracts; the output is validated against the data model. Documents with a text layer send text, scanned ones send the file itself.
**Done when:** a real run over the 12 sample PDFs produces the same findings and total as offline mode, the scanned invoice extracts correctly, and output that fails validation is rejected with a clear reason instead of stored.
spec [0005](../specs/0005-llm-classify-extract/index.md) · code in `lib/extract/`, `lib/ingest/csv.ts`, `lib/audit/`, `scripts/audit-live/` (`pnpm audit:live`)
- [x] Design it (spec): `/architect LLM classify & extract`
- [x] Build it: `/develop LLM classify & extract`
  - [x] SDK, env, `lib/log.ts` and the import boundary lint rules (AC-12, AC-13)
  - [x] Thin whole: strict tools, prompt, request and the text PDF path on a fake client, then the gated live smoke test (AC-1, AC-3, AC-14)
  - [x] Scan path and input guards, then every failure path: repair turn, reject, refusal, cut off, API errors (AC-2, AC-4 to AC-7, AC-11)
  - [x] CSV parsers moved to `lib/ingest/csv.ts`, then `pnpm audit:live` with compare and the atomic store, run green on a real key (AC-8 to AC-11)
- [x] Verify it: `/check verify LLM classify & extract`

### 8. Upload & ingest · done
Upload PDFs and CSVs in the browser, and one ingest endpoint that both the upload and the n8n workflow post to. On the public demo, uploads are limited to the sample files.
**Done when:** an uploaded file is stored, extracted and audited; the endpoint rejects unknown file types, oversized files and unauthenticated webhook calls; the public demo cannot send outside documents to the model.
spec [0006](../specs/0006-upload-ingest/index.md) · code in `lib/ingest/`, `app/actions.ts`, `app/api/ingest/`, `app/_components/upload-panel.tsx`
- [x] Design it (spec): `/architect upload & ingest`
- [x] Build it: `/develop upload & ingest`
  - [x] Config, file type detection and the upload folder store (AC-4, AC-5, AC-15, AC-17)
  - [x] Thin whole: `ingestFile` for PDFs and CSVs, the upload action and the home page panel with headline (AC-1, AC-2, AC-9, AC-12, AC-13, AC-16)
  - [x] Duplicates, Retry and the restart sweep (AC-8, AC-10, AC-11)
  - [x] Demo gate and `loadSample` emptying uploads (AC-7, AC-14)
  - [x] `/api/ingest` webhook with its guards (AC-3, AC-5, AC-6, AC-17)
- [x] Verify it: `/check verify upload & ingest`

## Release 3: Analyst review

An analyst can now judge every finding and hand over a claim list.

### 9. Design system & UI foundation · done
A calm, credible finance tool look: type, color, spacing, tables, tiles, and base components, so the review screen and landing page feel like one real product.
**Done when:** `design.md` covers type, color, spacing and the core components, and the base components render in the scaffold.
spec [0007](../specs/0007-design-system-ui-foundation/index.md) · code in `app/styles/`, `app/globals.css`, `app/(app)/`, `app/styleguide/`, `components/` · wireframes [Auditor Wireframes](https://claude.ai/design/p/41c4bab7-232e-4081-8911-fc9e827fd34b?file=Auditor+Wireframes.dc.html) (1a app bar, 1d documents, 1j empty state)
- [x] Design it (spec): `/architect design system & UI foundation`
- [x] Build it: `/develop design system & UI foundation`
  - [x] DESIGN.md committed with `design:lint`, the token seed, mapping layer, fonts and drift test, shadcn init with the Button (AC-1 to AC-6, AC-16, AC-17)
  - [x] Thin whole: Money, SummaryTile, Chip, AppBar, the `(app)` shell, `/` redirect, `/review` stub, Load sample data with its reload guard (AC-8, AC-10 to AC-13)
  - [x] Remaining primitives and `/styleguide` (AC-7, AC-9)
  - [x] `/documents` move and restyle, source guards, full green pass (AC-14, AC-15, AC-18)
- [x] Verify it: `/check verify design system & UI foundation`

### 10. Review screen · done
Summary tiles (recoverable, approved, pending, % of invoiced), findings sorted by amount, and a detail panel showing the invoice with flagged lines highlighted beside contract price and quantity received. Approve or Reject, with a reason required to reject. Holds the "Load sample data" button.
**Done when:** on the sample data the tiles show $9,766.85 recoverable and 18.1% of invoiced, findings list largest first, each detail shows its evidence, rejecting without a reason is blocked, and decisions survive a reload.
spec [0008](../specs/0008-review-screen/index.md) · code in `app/(app)/review/`, `app/actions.ts`, `lib/checks/invoice-view.ts`, `lib/audit/review.ts`, `lib/db/audit.ts` · wireframes [Auditor Wireframes](https://claude.ai/design/p/41c4bab7-232e-4081-8911-fc9e827fd34b?file=Auditor+Wireframes.dc.html) (1a split pane chosen; 1f reject dialog)
- [x] Design it (spec): `/architect review screen`
- [x] Build it: `/develop review screen`
  - [x] Storage and pure view logic: `listFindings` fields, typed `decide` errors, reason cap, `EVIDENCE_LABEL`, `describeInvoiceLines`, `highlightsFor`, `reviewTotals`, `nextPendingKey` (AC-1, AC-2, AC-4 to AC-6, AC-8, AC-9, AC-12, AC-16)
  - [x] Thin whole: `decideFinding`, four tiles, findings table, URL selection, invoice paper with highlights, evidence line, decision bar and reject dialog (AC-1 to AC-10, AC-16, AC-17)
  - [x] Edges, narrow screens and keyboard: unknown key caption, stale key alert, zero findings panel, stacked layout, ↑ ↓ A R (AC-3, AC-11 to AC-14)
  - [x] Logging and full green pass: `finding_decided` event, typecheck, lint, test, build, design lint (AC-15, AC-17)
- [x] Verify it: `/check verify review screen`

### 11. Export · in-progress
The finding log as `.xlsx` and `.csv`, including the analyst's decisions and a total row.
**Done when:** both files open cleanly, list every finding with its evidence and decision, and the total row matches the review screen after approvals and rejections.
spec [0009](../specs/0009-export/index.md) · code in `lib/export/`, `lib/audit/export.ts`, `app/api/export/` · wireframes [Auditor Wireframes](https://claude.ai/design/p/41c4bab7-232e-4081-8911-fc9e827fd34b?file=Auditor+Wireframes.dc.html) (1g export menu chosen; 1h claim preview deferred)
- [x] Design it (spec): `/architect export`
- [x] Build it: `/develop export`
  - [x] Pure pieces: labels, money and time formatting, file name, `exportTable`, the csv writer with BOM, quoting and formula guard (AC-4 to AC-8, AC-10, AC-11)
  - [x] Thin whole: `readExport` and `handleExportRequest`, `/api/export`, the Export menu in the app bar, csv end to end (AC-1, AC-3, AC-12, AC-13)
  - [x] Excel: `exceljs`, the Findings and Summary sheets, round trip test (AC-7 to AC-9, AC-13)
  - [x] Edges and green pass: disabled Export with tooltip, 400 and 404, `export` log event, demo mode, full checks (AC-2, AC-3, AC-14 to AC-16)
- [x] Verify it: `/check verify export`

## Release 4: Intake and launch

Automated intake, a public face, and a demo clients can open.

### 12. n8n Drive intake
An n8n workflow that watches a Google Drive folder and posts each new file to the ingest endpoint, committed as `n8n/intake.json`.
**Done when:** a file dropped in the watched folder shows up audited in the app, and the committed workflow imports into a fresh n8n with only the webhook address and secret to fill in.
- [ ] Build it: `/develop n8n Drive intake`

### 13. Landing page & social card · needs a decision
A short public front page leading with the headline result ("read 12 documents and found $9,766.85 of overpayments in under a minute"), a "Try the demo" button, page metadata, and a link preview image for sharing on Upwork.
**Done when:** the page loads fast, states the result and who it is for, links straight into the demo, and a shared link shows a proper title, description and preview image.
wireframes [Auditor Wireframes](https://claude.ai/design/p/41c4bab7-232e-4081-8911-fc9e827fd34b?file=Auditor+Wireframes.dc.html) (3a hero + features, 1i landing, 1k social card)
- [ ] Design it (spec): `/architect landing page & social card`

### 14. Public demo deploy · needs a decision
Put the app on a public URL in sample data only mode, with the API key kept server side and nothing sent to third party storage.
**Done when:** a visitor with no account and no key can open the URL, load the sample, review findings and export; secrets are not in the repo; the deploy can be repeated from the README.
- [ ] Design it (spec): `/architect public demo deploy`

### 15. Portfolio packaging
The public face of the repo: README with a screenshot, how to run it, and how the checks work, plus a 60 to 90 second screen recording.
**Done when:** the GitHub repo is public with a README and screenshot, and the recording shows sample load, findings, approve and reject, and export.
- [ ] Build it: `/develop portfolio packaging`

## Deferred
Out of scope for this build, kept so the plan stays honest.
- **Logins and multi tenancy**: separate accounts and workspaces · needs a decision · GA
- **Upwork prospect accounts**: once logins exist, create an account with its own username and password for each client you send an Upwork proposal to (where it fits), so they can use it live under that login · needs a decision · after logins
- **Accounting system push**: send approved claims to QuickBooks or Xero (the brief's next step) · needs a decision
- **Visitor uploads on the public demo**: real files with a rate limit or the visitor's own key · needs a decision
- **Overlapping CSV exports**: detect rows repeated across two receipts or payments files · from spec 0006
- **CI on push**: GitHub Actions for typecheck, test and build, skipped for now (from spec 0001)
- **Error monitoring**: report crashes on the public demo · needs a decision
- **Visitor analytics**: count visits and sample loads · needs a decision
- **Per visitor demo decisions**: isolate each visitor's approvals on the public demo instead of one shared audit (or a nightly reset) · from spec 0008
- **Claim preview page**: wireframe 1h, the claim table and totals on screen with the two downloads · from spec 0009
- **Approved only claim sheet**: a file holding just the approved recover findings, ready to send a supplier · from spec 0009
- **Large runs on the review screen**: cap or paginate the findings table and load one invoice with a targeted query once a run holds hundreds of findings · from spec 0008

## Legend

**The decision box.** Every feature carries exactly one, the sub task whose label ends with `(spec)`. Its wording varies (`Design it (spec)` normally, `Decide the stack (spec)` on Stack & architecture), so skills locate it by that `(spec)` suffix, never by an exact label. Every other box is an execution box and `/architect` never ticks one.

**Feature lifecycle**: the scope updates as a feature moves; each row is what it shows and who sets it:

| State | Set by | The feature shows |
|---|---|---|
| `planned` · needs a decision | `/scope` | one box: `Design it (spec): /architect <feature>` |
| `in-progress` (designed) | **`/architect` at spec capture** | `Design it` ticked; spec linked; `Build it: /develop <feature>` + **2 to 5 milestones**; the tier's closing boxes (`Verify it` Alpha+, `Test it` Beta+, `Review it` + `Document it` GA); any surfaced follow up enrolled |
| `in-progress` (building) | `/develop` | milestone sub boxes tick one by one; code pointer filled |
| `in-progress` (verified) | `/check verify` | `Build it` + milestones ticked; `Verify it` ticked |
| `done` | **you, when you decide it is** (any skill sets it when you say so); `/sync` reconciles | boxes you ran ticked, skipped ones marked skipped; the tier's last stage (`Prototype` → after `/develop`; `Alpha` → after `/check verify`; `Beta`/`GA` → after `/test`) is the suggested point to call it done; `/sync` captures conventions |

- **Next step** = the first unticked box (always a command or a tracked milestone).
- **needs a decision** = run `/architect` first; otherwise straight to `/develop` (or `/audit` for standards & tooling). The tag drops once the spec is captured.
- **Atomic build tasks live in the spec's `## Build plan`, not here**: the scope carries only the milestone rollup.
- **Status** `planned` → `in-progress` → `done`, plus `existing` (pre workflow) and `dropped` (de scoped, kept for history).
- **Approach tag** beside a heading (e.g. `· Facade`) overrides the project default for that feature; no tag = inherits it.
- **Workflow tier tag** beside a heading (e.g. `· Beta`) sets that one feature's rigor above or below the project default; no tag inherits the default. It decides the feature's check boxes and each skill's next suggestion.
- **Workflow** (header line) is the project default, what runs after `/develop`: **Prototype** = nothing (trust develop's own build time self check); **Alpha** = `/check verify`; **Beta** = `/check verify` then `/test`; **GA** = adds a fresh model `/check review` then `/document`. A feature built on an unratified decision (an `Assumed` spec) stays flagged, but that never blocks `done`.
- **Pointer line** (`spec <n> · code in <path>`): the spec link added by `/architect`, the code path by `/develop`.
