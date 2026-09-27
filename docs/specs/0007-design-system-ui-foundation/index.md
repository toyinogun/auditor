# 0007. Design system and UI foundation from DESIGN.md

**Date**: 2026-09-27
**Status**: In Progress

## Summary

This spec turns `DESIGN.md` ("Highlighter Ledger") into working code: tokens (the named colors, sizes and radii every screen uses), fonts, restyled shadcn components, a few shared pieces (status chip, money figure, summary tile, app bar) and the app shell with its routes. The token values will come from a Claude Design export. That export lands untouched in one file, and `globals.css` maps it into Tailwind and shadcn, so a reimport never breaks the wiring. A test checks every imported value against `DESIGN.md`. Until your export exists, `/develop` writes a seed file from `DESIGN.md`, so nothing waits. The foundation is proven on a `/styleguide` page, a first `/review` page showing the headline tiles, the upload page restyled at `/documents`, and a working Load sample data button.

## Requirements

**User stories**:
- As an analyst, I want every screen to share one calm, dense look, with money always in aligned mono figures, so that I can compare numbers fast and trust what I read.
- As a demo visitor, I want one Load sample data button in the app bar that fills the audit, so that I can see the result in one click with no key.
- As the owner, I want the look to come from my Claude Design export and stay true to `DESIGN.md`, so that a reimport can't quietly change a color (amber means money).
- As the builder of Features 10, 11 and 13, I want ready components, a shell and routes, so that those screens are built from parts, not from scratch.

**Acceptance criteria**:
- **AC-1**: Token file. `app/styles/design-tokens.css` defines, as plain `:root` custom properties (CSS variables), every `DESIGN.md` color, every radius, the layout spacing values (`row-height`, `gutter`, `page-margin`, `app-max-width`, `measure`) and, per typography role, its size, line height, letter spacing and weight. No other file in the repo imports it except `app/globals.css`.
- **AC-2**: Mapping layer. `app/globals.css` imports the token file and maps it with `@theme inline` so these utilities work: `bg-<color>`, `text-<color>` and `border-<color>` for every `DESIGN.md` color name (`primary`, `primary-hover`, `primary-deep`, `primary-deeper`, `secondary`, `tertiary`, `tertiary-soft`, `tertiary-wash`, `tertiary-deep`, `surface`, `on-surface`, `on-surface-muted`, `outline`, `border`, `neutral`, `neutral-well`, `error`, `error-wash`), `rounded-xs|sm|md|lg` at `DESIGN.md` values, and one `type-<role>` utility per typography role (`type-display-xl` … `type-data-md-strong`) that sets family, size, line height, tracking, weight and font features together. Tailwind's default 4px spacing step stays (it equals `DESIGN.md`'s 4px base), and the layout names are available as `h-row-height`, `max-w-app`, `px-page`, `gap-gutter`, `max-w-measure`.
- **AC-3**: shadcn aliases. `globals.css` also sets shadcn's variables from the same tokens (table in *Feature design*), light mode only: no `.dark` block and no `dark:` classes anywhere.
- **AC-4**: Drift test. `app/styles/design-tokens.test.ts` parses the `DESIGN.md` front matter with `yaml`, and `globals.css` plus `design-tokens.css` with `postcss`. For each `DESIGN.md` color, radius and layout spacing value, it finds the Tailwind token through the *DESIGN.md to Tailwind name table* (in *Feature design*), resolves it through at most one `var()` step into the token file, and fails if the value is missing or differs, naming the token and both values. For each typography role, it reads the `@utility type-<role>` rule and checks its `font-size`, `line-height`, `letter-spacing` and `font-weight` the same way. It also checks that its `font-family` is `var(--font-sans|mono|serif)` matching the role's `DESIGN.md` family, and that its `font-feature-settings` equals the role's `fontFeature` (absent when `DESIGN.md` has none). Colors compare after conversion to 8 bit sRGB with `culori` (so hex, `rgb()` and `oklch()` exports all work). It passes on the seed file.
- **AC-5**: Reimport. Replacing `design-tokens.css` with a Claude Design export needs edits only in the mapping layer (the right hand side of each `var()` in `globals.css`), never in a component. Components use Tailwind utilities and `type-*` only, never a raw `var(--…)` from the token file.
- **AC-6**: Fonts. IBM Plex Sans (400, 600), IBM Plex Mono (400, 600) and Instrument Serif (400) load through `next/font/google`, Latin subset, `display: "swap"`, exposed as CSS variables on `<html>` and mapped to `--font-sans`, `--font-mono`, `--font-serif` with `DESIGN.md`'s fallback stacks. `type-data-*` sets `font-feature-settings: "tnum" 1, "zero" 1`; `type-label-caps` sets `"case" 1` and uppercase. The browser never fakes a serif bold (`font-synthesis: none` on the serif roles).
- **AC-7**: Primitives. shadcn is set up (Radix, `components.json`, `lib/utils.ts` with `cn`), and these are added to `components/ui/` and restyled to `DESIGN.md`: Button (variants `primary`, `secondary`, `destructive`, plus `ghost` for icon only buttons; 36px tall, `type-label-md`, `rounded-md`, optional 16px left icon, disabled at 45% opacity with no hover), Input and Textarea (36px input, `rounded-sm`, Pencil outline, `aria-invalid` shows the Rust outline), Dialog (480px, `rounded-lg`, the one two layer ink shadow, backdrop Harbour Ink at 32%), Tooltip (Harbour Ink with White `type-caption`, 400ms delay), Dropdown Menu (the same shadow, `rounded-sm`), Table (header `type-label-caps` on Canvas 32px tall, 36px rows with 1px Rule lines, no zebra striping, a `data-selected` row turns Frozen Water with a 2px Deep Lagoon left edge).
- **AC-8**: Shared pieces in `components/`. `Chip` with `state` `pending | approved | rejected | working`, each with its `DESIGN.md` fill, text color and Lucide icon (empty circle, check, cross, clock) plus a `label` prop (so upload statuses can reuse the look with their own words). `Money` takes integer cents and renders `formatCents` output, always with cents, never abbreviated, at `size` `md` (`type-data-md`, the default), `lg` (`type-data-lg`) or `display` (serif `type-display`, used only by the recoverable tile, as `DESIGN.md` specifies). `SummaryTile` takes `label` and a figure; variant `default` renders the figure in `type-data-lg` on Canvas, variant `recoverable` renders a `Money size="display"` on Amber Wash with a 2px Amber Glow underline under the figure. `AppBar` per AC-10.
- **AC-9**: Showcase. `/styleguide` renders every color token (swatch, name, value), every type role (a sample line with its name), every radius, and every primitive and shared piece in every state (button hover, focus and disabled; all four chips; both tile variants; a table with a selected row; a dialog, tooltip and menu you can open). It calls `await connection()` before reading `env.DEMO_MODE`, so the answer is decided per request and never baked in at build time. With `DEMO_MODE=true` it answers 404 through `notFound()`. It is not linked from the app bar.
- **AC-10**: Shell and routes. An `app/(app)/layout.tsx` route group wraps `/review` and `/documents` with the AppBar: 56px, Canvas fill, 1px Rule bottom line. At left is "Overpayment Auditor" in `type-headline-sm`, linking to `/review`. Next come nav links Review and Documents, with `aria-current="page"` on the current one. At right is the Load sample data primary button. Page content sits in a frame capped at 1440px with 32px side margins. `/` redirects to `/review` (Feature 13 replaces it with the landing page, which sits outside the group and has no app bar).
- **AC-11**: Review stub. `/review` shows the page title "Review" in `type-headline-lg` serif. With an audit run, it shows three tiles in the `DESIGN.md` asymmetric row (the recoverable tile spans 2 of 5 columns): Recoverable (`$9,766.85` on the sample, `recoverable` variant), Findings (`8`) and % of invoiced (`18.1%`). With no run, it shows an empty state: "No audit yet" and one line pointing to Load sample data (no second primary button on the page). The page renders per request (`connection()`), never prerendered.
- **AC-12**: Load sample data. The button calls a new Server Action `loadSampleData()`, which runs `loadSample` with the upload store (never creating a model client) and returns `Result<{ findingCount, recoverableCents }, string>`. On success it calls a new `revalidateAudit()` helper (in `app/actions.ts`, running `revalidatePath("/", "layout")`, so every page and the app bar's decision count rerender) and sends you to `/review`, where the tiles show the new run. While it runs, the button is disabled, shows a spinner icon and reads "Loading sample…". On failure, a `role="alert"` message in Rust `type-caption` appears beside the button, and the button becomes usable again. It works with `DEMO_MODE` on or off (no model call either way). It logs one `sample_loaded` event (finding count, outcome) through `logEvent`.
- **AC-13**: Reload guard. When the `decisions` table holds at least one row, pressing Load sample data opens a Dialog instead of running: title "Reload the sample data?", body "This clears 1 saved decision (an approval or rejection) and starts a fresh audit." when N is 1, else "This clears N saved decisions (approvals and rejections) and starts a fresh audit.", with Cancel (secondary, the default focus) and Reload sample (destructive). With zero decisions, it runs at once. N comes from a new `countDecisions(db)` in `lib/db/audit.ts`, read by the `(app)` layout on each request. Rule for every later action that changes decisions or runs (Feature 10's approve and reject): call `revalidateAudit()` so N never goes stale in the app bar.
- **AC-14**: Documents page. The upload panel moves to `/documents` and is restyled with its behavior, action calls and spec 0006 tests unchanged: page width capped at 880px and left aligned, title "Documents" in `type-headline-lg`, a drop zone (Canvas, 1px dashed Pencil border, `rounded-md`; on drag over it turns Frozen Water with Deeper Lagoon text and a solid border) holding one primary Choose files button and a caption with the size limit, and one row per file (filename, kind in muted text, a `Chip`, and Retry as a secondary button on failed rows) with the refusal or failure reason under the row in Rust `type-caption`. Chip mapping: `done` and `already ingested` → approved look, `uploading` and `in progress` → working, `failed` and `refused` → rejected, each keeping its own word. The headline line stays below the list, with amounts in `Money`.
- **AC-15**: Source guards. A test scans every `.ts`, `.tsx` and `.css` file under `app/`, `components/` and `lib/` and fails, naming the file, when: (a) the word `tertiary` appears in any form (named utility, arbitrary value such as `bg-(--color-tertiary)`, or `var()`) outside an allowlist, which starts as `app/globals.css`, `app/styles/`, `components/summary-tile.tsx`, `components/chip.tsx` (working state) and `app/styleguide/` (Feature 10 adds its invoice paper file); (b) any file other than `app/globals.css` and the test itself mentions `design-tokens.css` or a `--ds-` name.
- **AC-16**: Focus and motion. Every focusable element shows a 2px Deep Lagoon ring with a 2px White offset on `:focus-visible`, and it is never removed. Hover, selection and chip changes animate at 120ms `ease-out`. Dialogs and menus enter at 180ms `cubic-bezier(0.2, 0, 0, 1)` and leave at 120ms `ease-in`. Under `prefers-reduced-motion: reduce`, every transition and animation is instant.
- **AC-17**: DESIGN.md is tracked. `DESIGN.md` is committed at the repo root, and `pnpm design:lint` runs the pinned `@google/design.md` CLI (`designmd lint DESIGN.md`) and exits clean.
- **AC-18**: Green. `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` and `pnpm design:lint` all pass.

## Decision

**Chosen option**: Option 1: a verbatim token file from Claude Design, a thin mapping layer in `globals.css`, a drift test against `DESIGN.md`, and restyled shadcn primitives plus a few shared pieces.

The Claude Design export owns token values. `DESIGN.md` owns what is correct, and the test enforces it. `globals.css` owns the names Tailwind and shadcn see. Components own nothing but utilities.

**Implementation skills**: `shadcn` (`shadcn-ui/ui`, `.agents/skills/shadcn/`) · `tailwind-v4-shadcn` (`secondsky/claude-skills`, `.agents/skills/tailwind-v4-shadcn/`; take its `@theme inline` and CSS variable patterns, ignore its Vite config) · `nextjs-patterns` (user skill, `~/.claude/skills/nextjs-patterns/`)

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Design source**: `DESIGN.md` at the repo root (Highlighter Ledger) is the source of truth for every value, rule and component look. Token values arrive as a Claude Design (claude.ai/design) export, tokens only. Components are built here on shadcn and Radix to `DESIGN.md`, not ported from the export.

**Wireframes**: [Auditor Wireframes](https://claude.ai/design/p/41c4bab7-232e-4081-8911-fc9e827fd34b?file=Auditor+Wireframes.dc.html) (Claude Design, low fidelity). This feature's surfaces are 1a's app bar, 1d (documents: drop zone and file rows) and 1j (review empty state). The same file holds Feature 10 (1a to 1c, 1f), Feature 11 (1g, 1h) and Feature 13 (3a, 1i, 1k). Layout and copy come from the wireframes; every value and rule still comes from `DESIGN.md` and the ACs here. Where they disagree, this spec wins: 1a shows Load sample data as a secondary button beside a primary Export (here it is the app bar's one primary, and Export arrives with Feature 11), and 1j puts a Load sample data button in the page (AC-11 keeps it to one line pointing at the app bar).

**Files**:

```
DESIGN.md                        committed source of truth (AC-17)
app/styles/design-tokens.css     token values: seed now, Claude Design export later (verbatim, never hand edited after import)
app/styles/design-tokens.test.ts drift test (AC-4) and the source guards (AC-15)
app/globals.css                  @import tailwindcss, tw-animate-css, ./styles/design-tokens.css; the mapping layer; base styles
app/fonts.ts                     the three next/font/google instances
app/layout.tsx                   root: fonts on <html>, metadata, TooltipProvider (400ms, so /styleguide gets it too); no app bar
app/page.tsx                     redirect("/review") until Feature 13
app/(app)/layout.tsx             AppBar + page frame; reads countDecisions
app/(app)/review/page.tsx        the stub (AC-11); Feature 10 grows it
app/(app)/documents/page.tsx     today's home page content, moved (AC-14)
app/(app)/_components/load-sample-button.tsx   client: pending state, guard dialog, error (AC-12, AC-13)
app/_components/upload-panel.tsx restyled in place (path unchanged, so its imports and tests stay)
app/styleguide/page.tsx          the showcase (AC-9), outside the (app) group
app/actions.ts                   + loadSampleData
components/ui/*                  shadcn: button, input, textarea, dialog, tooltip, dropdown-menu, table
components/chip.tsx · money.tsx · summary-tile.tsx · app-bar.tsx
lib/utils.ts                     cn (shadcn's default alias, kept so every future `shadcn add` works)
lib/db/audit.ts                  + countDecisions
```

**Token naming contract** (the seed uses these names, and an import may use its own). Source variables in `design-tokens.css` are prefixed `--ds-`: `--ds-color-<name>`, `--ds-radius-<name>`, `--ds-space-<name>`, `--ds-type-<role>-size|leading|tracking|weight`. The mapping layer is the only place that reads them.

**DESIGN.md to Tailwind name table** (the drift test uses this same table; any name not listed passes through unchanged, so `colors.primary-deep` becomes `--color-primary-deep` and `rounded.md` becomes `--radius-md`):

| `DESIGN.md` key | Tailwind token | Utility |
|---|---|---|
| `spacing.row-height` | `--spacing-row-height` | `h-row-height` |
| `spacing.gutter` | `--spacing-gutter` | `gap-gutter` |
| `spacing.page-margin` | `--spacing-page` | `px-page` |
| `spacing.app-max-width` | `--container-app` | `max-w-app` |
| `spacing.measure` | `--container-measure` | `max-w-measure` |
| `spacing.base` | `--spacing` (Tailwind's step, must equal 4px / 0.25rem) | `p-4` … |
| `spacing.xxs` … `spacing.4xl` | not mapped (Tailwind's numeric scale covers them: `xs` = 1, `sm` = 2, `md` = 3, `lg` = 4, `xl` = 6, `2xl` = 8, `3xl` = 12, `4xl` = 20) | `p-3` … |
| `rounded.none`, `rounded.full` | Tailwind built ins | `rounded-none`, `rounded-full` |
| `typography.<role>` | `@utility type-<role>` | `type-<role>` |

Why `@theme inline` for everything: it is required for the `next/font` variables (their names only exist at runtime), and using it for the `--ds-*` values too keeps one pattern and makes utilities resolve the source variable where they are used.

**Mapping layer:**

| Tailwind token (in `@theme inline`) | Reads | Gives you |
|---|---|---|
| `--color-<name>` for all 18 colors | `var(--ds-color-<name>)` | `bg-primary`, `text-on-surface-muted`, `border-border` … |
| `--radius-xs/sm/md/lg` | `var(--ds-radius-*)` | `rounded-xs` … `rounded-lg` (`none`, `full` are Tailwind's) |
| `--spacing-row-height`, `--spacing-gutter`, `--spacing-page` | `var(--ds-space-*)` | `h-row-height`, `gap-gutter`, `px-page` |
| `--container-app`, `--container-measure` | `var(--ds-space-app-max-width)`, `var(--ds-space-measure)` | `max-w-app`, `max-w-measure` |
| `--font-sans/mono/serif` | the `next/font` variables + fallback stacks | `font-sans` … |
| `@utility type-<role>` (14 roles) | family + `var(--ds-type-<role>-*)` + features | `type-data-md`, `type-display` … |

**shadcn alias table** (set in `:root` in `globals.css`, all pointing at the Tailwind tokens above). Where a shadcn name collides with a `DESIGN.md` name, `DESIGN.md` wins:

| shadcn variable | Maps to | Note |
|---|---|---|
| `--background` / `--foreground` | `surface` / `on-surface` | |
| `--card`, `--popover` (+ `-foreground`) | `surface` / `on-surface` | |
| `--primary` / `--primary-foreground` | `primary` / `on-surface` | ink on teal, never white |
| `--secondary` / `--secondary-foreground` | `secondary` / `primary-deeper` | name collision: this is Frozen Water ("this row", "approved"), not shadcn's grey button. The secondary *button* is rewritten as White with a Pencil outline |
| `--muted` / `--muted-foreground` | `neutral` / `on-surface-muted` | |
| `--accent` / `--accent-foreground` | `neutral-well` / `on-surface` | menu item hover |
| `--destructive` | `error` | text on it is `surface` |
| `--border` / `--input` / `--ring` | `border` / `outline` / `primary-deep` | |
| `--radius` | `radius-md` | |

**Component contract** (what Features 10, 11 and 13 build on):

| Component | Props | Notes |
|---|---|---|
| `Button` | `variant: "primary" \| "secondary" \| "destructive" \| "ghost"`, `size: "md" \| "sm"`, `asChild`, plus button props | `sm` is 28px, for row actions like Retry |
| `Chip` | `state: "pending" \| "approved" \| "rejected" \| "working"`, `label?: string`, `spin?: boolean` | the default label is the state word. `spin` swaps the clock for a spinner (uploading) |
| `Money` | `cents: number`, `size?: "md" \| "lg" \| "display"`, `strong?: boolean` | renders `formatCents` from `lib/schemas/money`; `display` is serif and reserved for the recoverable tile |
| `SummaryTile` | `label: string`, `variant: "default" \| "recoverable"`, `children` (the figure) | `children` is usually a `Money` or a plain mono string such as `18.1%` |
| `AppBar` | `decisionCount: number` | server component that renders the nav and `LoadSampleButton` |

**Data model sketch**: no schema change. One new read: `countDecisions(db): number` = `SELECT count(*) FROM decisions`. It counts every stored row, including decisions that now read as pending because a finding's amount changed, since `resetAll` wipes those too.

**State transitions**: Load sample data button: `idle` → (decisionCount > 0) `confirming` → Cancel → `idle`, or Reload → `loading`; `idle` → (decisionCount = 0) `loading`; `loading` → success → navigate to `/review`, `idle`; `loading` → failure → `idle` with the error shown.

**API surface**:

| Surface | Kind | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `loadSampleData()` | Server Action in `app/actions.ts` | none | `Result<{ findingCount, recoverableCents }, string>` | none (public demo button, same as the brief) | a thrown load is caught at the edge, logged, and returned as `err("could not load the sample data, try again")` |
| `GET /review` | page | none | tiles or empty state | none | none |
| `GET /documents` | page | none | the upload panel | none | none |
| `GET /styleguide` | page | none | the showcase | none | 404 when `DEMO_MODE` |
| `GET /` | page | none | 307 to `/review` | none | none |

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| `/review` | Recoverable figure | `latestHeadline(db).recoverableCents` → `Money` |
| `/review` | Findings count | `latestHeadline(db).findingCount` |
| `/review` | % of invoiced | `latestHeadline(db).recoverableShare` (already rounded per spec 0004) |
| `/review` | empty state | `latestHeadline(db) === null` |
| AppBar | decision count N for the guard | `countDecisions(db)` in `app/(app)/layout.tsx` per request |
| AppBar | current nav item | `usePathname()` in a small client `NavLink` |
| `loadSampleData` | files store to empty | `uploadStore()` from `lib/ingest/deps.ts` (not `ingestDeps()`, which builds a model client) |
| `loadSampleData` | finding count, recoverable | the `AuditRunResult` `loadSample` returns |
| `/documents` | size limit caption | `env.MAX_UPLOAD_MB`, passed as today |
| `/styleguide` | 404 decision | `env.DEMO_MODE` |
| Fonts | families and weights | this spec (AC-6), matching `DESIGN.md` |
| Every token value | color, radius, spacing, type | `app/styles/design-tokens.css`, checked against `DESIGN.md` by AC-4 |
| Motion timings, shadow, backdrop | durations, easings, shadow string | `DESIGN.md` prose (Elevation, Components → Motion), written as Tailwind tokens in the mapping layer (`--shadow-float`, `--ease-enter`, `--duration-quick` 120ms, `--duration-enter` 180ms) |

**Key invariants**:
- Only `app/globals.css` imports `app/styles/design-tokens.css`, and only the mapping layer reads `--ds-*` names.
- Every token value equals `DESIGN.md` (AC-4). When they differ, fix the import or amend `DESIGN.md` on purpose. Never loosen the test.
- Amber (`tertiary*`) appears only where money was overpaid (AC-15 allowlist).
- Money is only ever rendered through `Money`: mono `type-data-*` everywhere, except the one serif `display` figure in the recoverable tile that `DESIGN.md` specifies. Never set a dollar figure in the sans.
- Every action that changes runs or decisions calls `revalidateAudit()`.
- No white text on any palette fill except the destructive button (Rust) and the tooltip (ink).
- Light only: no `dark:` variants, no `.dark` block.
- Instrument Serif is used only at 32px and up (`type-headline-lg`, `type-display`, `type-display-xl`).
- One primary button per region: the app bar holds Load sample data, and the documents drop zone holds Choose files.

**Security model**: no new data and no auth change. `loadSampleData` is public on purpose (the brief's demo button). It only replays the committed fictional sample, makes no model call, and cannot be fed input. The cost of spamming it is CPU for a few hundred ms per call, which the Feature 14 Cloudflare rate limit on action POSTs covers. `/styleguide` is hidden on the public demo so the internal showcase isn't indexed.

**Configuration required**: none new. It reads the existing `DEMO_MODE` and `MAX_UPLOAD_MB` through `lib/env.ts`.

**New dependencies** (all through `shadcn init` / `shadcn add` or the dev tooling): `radix-ui` primitives, `lucide-react`, `class-variance-authority`, `clsx`, `tailwind-merge`, `tw-animate-css`. Dev only: `yaml` (front matter parsing), `postcss` (explicit, already present through Tailwind; parses the CSS in the drift test), `culori` (color normalization in the drift test), `@google/design.md` (pinned, for `design:lint`).

**Critical test scenarios**:
- Happy path: with the seed file, the drift test passes. Change one hex in the seed and it fails, naming `tertiary` and both values. Verifies **AC-1**, **AC-4**.
- Happy path: on a fresh DB, press Load sample data. It runs without a dialog, then `/review` shows `$9,766.85`, `8` and `18.1%`. Verifies **AC-11**, **AC-12**.
- Failure case: record one decision, press Load sample data, and the dialog shows "1 saved decision". Cancel leaves the decisions in place, and Reload clears them. Verifies **AC-13**.
- Failure case: `loadSample` throws (test with an unwritable uploads dir). The button shows the alert, stays usable, and the DB still holds the previous run (the transaction rolled back). Verifies **AC-12**.
- Failure case: add `bg-tertiary-wash` to a documents page file, and the source guard fails naming the file; the same for `bg-(--color-tertiary)` and for a component that mentions `--ds-color-primary`. Verifies **AC-15**.
- Unit: the reload dialog body reads "1 saved decision" at N = 1 and "2 saved decisions" at N = 2. Verifies **AC-13**.
- Drift: drop `'zero' 1` from `type-data-md` in `globals.css` and the test fails naming the role. Verifies **AC-4**.
- Reimport: swap the seed for a file using different variable names and `oklch()` values of the same colors, and update only the mapping layer. The drift test passes and no component changes. Verifies **AC-5**.
- Auth/permission: with `DEMO_MODE=true`, `/styleguide` returns 404, while Load sample data still works. Verifies **AC-9**, **AC-12**.
- Regression: every spec 0006 upload test stays green after the panel restyle and move. Verifies **AC-14**.
- Unit: `countDecisions` on an in memory DB returns 0, then 2 after two `decide` calls, then 0 after `runSampleAudit`. Verifies **AC-13**.

## Build plan

Skateboard: the first milestone ships the thinnest usable whole (tokens, fonts, shell, a real page and the working button), then each later milestone grows it. It stays shippable after every step.

1. [x] Commit `DESIGN.md`. Add `@google/design.md` as a pinned devDependency and a `design:lint` script, and confirm it lints clean. Satisfies **AC-17**.
2. [x] Tokens and fonts. Write the drift test first (RED) with `yaml` and `culori`. Write the seed `app/styles/design-tokens.css` from `DESIGN.md` using the `--ds-` naming contract, then the mapping layer in `globals.css` (`@theme inline`, the `type-*` utilities, motion and shadow tokens, the focus ring and reduced motion base styles), and `app/fonts.ts` wired into the root layout (GREEN). Satisfies **AC-1**, **AC-2**, **AC-4**, **AC-5**, **AC-6**, **AC-16**.
3. [x] shadcn init (Radix, `components.json` with aliases `@/components`, `@/components/ui`, `@/lib/utils`) and the shadcn alias table in `globals.css`, with no dark block. Add Button and restyle it to the four variants. Satisfies **AC-3**, **AC-7** (Button).
4. [x] Thin whole. `countDecisions` test first, then build it. Build `Money`, `SummaryTile`, `Chip`, `AppBar` with `NavLink`, the `(app)` layout with its frame, `/` redirect and the `/review` stub. Build the `loadSampleData` action (action test with an in memory DB and a temp uploads dir, including the thrown load case) and `LoadSampleButton` with its pending state, error alert and guard Dialog (add shadcn Dialog here, restyled). Satisfies **AC-8**, **AC-10**, **AC-11**, **AC-12**, **AC-13**, **AC-7** (Dialog).
5. [x] Remaining primitives: add and restyle Input, Textarea, Tooltip (provider at 400ms in the `(app)` layout), Dropdown Menu and Table. Satisfies **AC-7**, **AC-16**.
6. [x] `/styleguide` with every token and every component state, plus the `DEMO_MODE` 404 check. Satisfies **AC-9**.
7. [x] Move the home content to `/documents` and restyle `upload-panel.tsx` (drop zone, rows, `Chip` mapping, Retry as `Button size="sm" variant="secondary"`, reasons, headline with `Money`). Spec 0006 tests stay green. Replace the `STATUS_STYLE` map with a status → chip state function in `upload-rows.ts`, with a unit test. Satisfies **AC-14**.
8. [x] Source guards test (amber allowlist, token file isolation). Then run the full green pass: typecheck, lint, test, build, design:lint. Satisfies **AC-15**, **AC-18**.

## Consequences

**Positive**:
- Features 10, 11 and 13 build from a known set of parts, and the review screen gets its tiles, chips, table and dialog already done.
- A Claude Design reimport is a one file swap plus, at most, a mapping edit, and the drift test catches an off palette export before it ships.
- The strict color jobs (amber means money) are enforced by a test, not only by memory.
- The demo gets its one click entry point now, not in Feature 10.

**Negative / tradeoffs**:
- Two sources to keep aligned (the export and `DESIGN.md`). The drift test makes a mismatch loud, but someone still has to decide which one is right.
- The shadcn `secondary` name now means Frozen Water, so any component copied in later that uses `bg-secondary` for a grey button must be restyled on arrival. The Follow-up adds this to the root `AGENTS.md` rules.
- Restyling copied shadcn components means future `shadcn add --overwrite` runs would undo the work. Components are added once, then owned.
- The drift test checks values, not visual correctness. A right token used in the wrong place still needs `/check verify` on `/styleguide`.
- Adds about six runtime and three dev dependencies.

**Neutral**:
- `/` becomes a redirect until Feature 13. Old links to the upload page land on `/review`, one click from Documents.
- `DESIGN.md`'s rule that a destructive button appears only in the reject dialog gets a second use in the reload guard. Step 1 amends that line in `DESIGN.md` to "only as the confirm button inside a confirm dialog (reject, reload sample)".

## Follow-up

- [ ] Import the Claude Design export into `app/styles/design-tokens.css` when it's ready, adjust only the mapping layer, and run `pnpm test` (the drift test decides whether the import is right).
- [ ] Root `AGENTS.md` (for `/sync`): point at `DESIGN.md` as the design source, record the token file / mapping layer split, the `secondary` name collision, "components use utilities only", the amber allowlist and `pnpm design:lint` in Commands.
- [ ] Feature 10 (review screen): replace the Findings tile with Approved and Pending, add the invoice paper file to the amber allowlist, use `Table` `data-selected` for the selected row, and call `revalidateAudit()` from the approve and reject actions.
- [ ] Feature 13 (landing page): replace the `/` redirect with the landing page outside the `(app)` group, using `type-display-xl`.
- [ ] Feature 14 (deploy): make sure the Cloudflare rate limit on action POSTs also covers `loadSampleData`.
