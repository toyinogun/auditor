# app

## Overview

The Next.js App Router layer: pages, the app shell, Server Actions, the n8n webhook route and the global styles. It holds no audit, storage or extraction logic; every page and action calls into `lib/` (spec 0001 layout) and renders with `components/`.

## Key files

| File | Owns |
|---|---|
| `layout.tsx` | root `<html>`: font variables from `fonts.ts`, `globals.css`, `TooltipProvider`, the `%s · Overpayment Auditor` title template |
| `page.tsx` | `/` redirects to `/review` until the landing page (Feature 13) replaces it |
| `(app)/layout.tsx` | the working app's shell: skip link, `AppBar` with `countDecisions` and `canExport` (a run exists) read per request, the 1440px frame |
| `(app)/review/page.tsx` | the review screen (spec 0008): four tiles, then the findings table and detail split pane selected by `?finding=<key>`, the zero findings panel, or spec 0007's empty state |
| `(app)/review/_components/` | the review screen's pieces: `findings-table.tsx`, `finding-detail.tsx`, `invoice-paper.tsx` (the one amber file here), `decision-bar.tsx`, `reject-dialog.tsx`, `use-review-keyboard.ts`, with pure logic in `decision.ts` and `review-keys.ts` |
| `(app)/documents/page.tsx` | intake page, capped at 880px, renders `_components/upload-panel.tsx` (spec 0006, restyled by 0007) |
| `(app)/_components/` | client pieces of the shell: `load-sample-button.tsx` (pending state, reload guard dialog, error), `nav-link.tsx` (`aria-current` from `usePathname`), `export-menu.tsx` (Export dropdown of two `<a download>` links to `/api/export`, disabled with a tooltip before the first run), `reload-warning.ts` (pure dialog copy) |
| `_components/upload-panel.tsx`, `upload-rows.ts` | the upload panel (client) and its pure row model, unit tested |
| `actions.ts` | every Server Action: `loadSampleData`, `uploadFile`, `retryUpload`, `decideFinding`, plus `revalidateAudit()` |
| `api/ingest/route.ts` | the n8n webhook (spec 0006, AC-3), a thin wrapper over `handleIngestRequest` in `lib/ingest/` |
| `api/export/route.ts` | `GET /api/export?format=xlsx\|csv` (spec 0009), a thin wrapper over `handleExportRequest` in `lib/audit/export.ts` |
| `styleguide/page.tsx` | internal showcase of every token and component state (spec 0007, AC-9); 404 when `DEMO_MODE=true` |
| `fonts.ts` | IBM Plex Sans, IBM Plex Mono and Instrument Serif via `next/font/google`, exposed as CSS variables |
| `styles/design-tokens.css` | the token values (seed or Claude Design export), read only by `globals.css` |
| `globals.css` | the mapping layer: `@theme inline`, shadcn aliases, `type-<role>` utilities, focus ring and motion |
| `styles/design-tokens.test.ts` | drift test against `DESIGN.md` plus the amber and token file source guards |

## Conventions

- Every page or layout that reads SQLite calls `await connection()` first, so it renders per request and is never prerendered (better-sqlite3 is synchronous). The same goes for reading `env` values that must be decided at request time (`/styleguide`'s `DEMO_MODE` check).
- Pages under the `(app)` route group get the app bar. A page without it (the future landing page, `/styleguide`) sits outside the group.
- Server Actions live only in `actions.ts` (`"use server"`), return `Result`, and stay thin: parse the form, then call one `lib/` function with `getDb()` and `ingestDeps()` or `uploadStore()`.
- Any action that changes runs or decisions calls `revalidateAudit()` on success, so every page and the app bar's decision count rerender (spec 0007, AC-13). Feature 10's approve and reject must follow this.
- Route handlers set `export const runtime = "nodejs"` (SQLite, the file system and the SDK).
- Keep client components small and in a `_components/` folder next to the route that uses them; put their pure logic in a sibling `.ts` file with a test (`reload-warning.ts`, `upload-rows.ts`).
- Page titles come from `export const metadata = { title: "<Page>" }`; the root template adds the product name.

## Gotchas

- After replacing `styles/design-tokens.css` with a new export, edit only the right hand side of each `var()` in `globals.css`. Never touch a component, and never loosen the drift test (spec 0007, AC-5).
- `globals.css` resets Tailwind's palette (`--color-*: initial`), so only `DESIGN.md` color names exist as utilities.
- Adding amber (`tertiary*`) to a new file fails `pnpm test` until the file is added to `AMBER_ALLOWLIST` in `styles/design-tokens.test.ts`, and it only belongs there if the file shows overpaid money.
- `instrumentation.ts` at the repo root (not in `app/`) opens the database and sweeps interrupted uploads at server start.

## Related specs

- [0006 upload and ingest](../docs/specs/0006-upload-ingest/index.md)
- [0007 design system and UI foundation](../docs/specs/0007-design-system-ui-foundation/index.md)
- [0008 review screen](../docs/specs/0008-review-screen/index.md)
- [0009 export](../docs/specs/0009-export/index.md)

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
