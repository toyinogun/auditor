# Verify: Design system and UI foundation · spec 0007 · updated 2026-09-27
_Steps derived from spec 0007 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual
- [x] Fresh `DATA_DIR`, open `/` → redirects to `/review`, shows "Review" in the serif, "No audit yet" and one line pointing to Load sample data, with no second primary button on the page → AC-10, AC-11
- [x] App bar is 56px of Canvas over a 1px Rule: "Overpayment Auditor" left (links to `/review`), Review and Documents nav, Load sample data at right; the current link has `aria-current="page"` → AC-10
- [x] Press Load sample data with no decisions → no dialog, button reads "Loading sample…" with a spinner while running, then `/review` shows `$9,766.85` (serif, Amber Wash tile, Amber Glow underline), `8` and `18.1%` → AC-8, AC-11, AC-12
- [x] The recoverable tile spans 2 of 5 columns at desktop width; figures are mono except the serif recoverable one → AC-8, AC-11
- [x] Store one decision (`sqlite3 $DATA_DIR/auditor.db` insert, until Feature 10 adds Approve), reload `/review`, press Load sample data → dialog "Reload the sample data?" with "This clears 1 saved decision (an approval or rejection) and starts a fresh audit."; Cancel has focus → AC-13
- [x] Cancel → decisions still stored; press again and choose Reload sample → decisions table empty, one new `sample_loaded` log line → AC-12, AC-13
- [x] Hold a write lock on the database (`(echo "BEGIN EXCLUSIVE;"; sleep 25; echo "COMMIT;") | sqlite3 $DATA_DIR/auditor.db &`) and press Load sample data → after about 5 seconds a Rust `role="alert"` message appears beside the button, the button is usable again, `audit_runs` still holds the previous run → AC-12
- [x] Make the uploads folder unwritable and press Load sample data → no alert, `/review` shows the new run, and the log line reads `"uploadsCleared":false` → AC-12
- [x] `/documents` → width capped at 880px and left aligned, "Documents" title, Canvas drop zone with dashed Pencil border, one Choose files button and the size caption; dragging a file over turns it Frozen Water with a solid border → AC-14
- [x] After the sample load, each file row shows filename (mono), kind, and an approved-look chip reading "done"; upload a non PDF/CSV file → refused row with a Rust caption reason; the headline below the list shows amounts in mono → AC-14
- [x] Tab through the app bar and the Documents page → every focusable element shows a 2px Deep Lagoon ring with a White gap → AC-16
- [x] With the OS "reduce motion" setting on, open the reload dialog → it appears instantly → AC-16
- [x] `/styleguide` (DEMO_MODE unset) → every color with name and value, 14 type roles, radii, buttons default and disabled, fields incl. invalid, all chips, both tile variants, a table with a selected row, and an openable dialog, menu and tooltip → AC-7, AC-9
- [x] Hover the tooltip trigger on `/styleguide` → Harbour Ink tooltip after about 400ms → AC-7
- [x] At 390px wide, the app bar wraps and Load sample data stays on screen → AC-10

## Commands
- [x] `pnpm test` → drift test and source guards pass (47 tests in `app/styles/design-tokens.test.ts`) → AC-4, AC-15
- [x] Change `--ds-color-tertiary` in `app/styles/design-tokens.css` by one digit, run `pnpm vitest run app/styles` → fails naming `color tertiary` and both values; revert → AC-1, AC-4
- [x] Drop `"zero" 1` from `type-data-md` in `app/globals.css` → the drift test fails naming the role; revert → AC-4, AC-6
- [x] `pnpm design:lint` → 0 errors, 0 warnings → AC-17
- [x] `pnpm build && DEMO_MODE=true pnpm start` → `/styleguide` answers 404, `/review` 200, Load sample data still works → AC-9, AC-12
- [x] `grep -rn "dark:" app components` and `grep -n "\.dark" app/globals.css` → nothing → AC-3
- [x] `pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm design:lint` → all pass → AC-18

## Value sourcing
- [x] Recoverable figure = `latestHeadline(db).recoverableCents`: after a sample load it equals the brief's `$9,766.85`
- [x] Findings count = `latestHeadline(db).findingCount`: `8`
- [x] % of invoiced = `latestHeadline(db).recoverableShare`: `18.1%`, not recomputed in the page
- [x] Empty state = `latestHeadline(db) === null`: on a fresh `DATA_DIR` only
- [x] Decision count N = `countDecisions(db)` per request: store 2 decisions and the dialog says "2 saved decisions" without a server restart
- [x] Current nav item = `usePathname()`: `/documents` marks Documents, `/review` marks Review
- [x] `loadSampleData` empties uploads through `uploadStore()` and never builds a model client: works with no `ANTHROPIC_API_KEY` set
- [x] Size caption = `env.MAX_UPLOAD_MB`: start with `MAX_UPLOAD_MB=5` and the caption reads "up to 5 MB each"
- [x] `/styleguide` 404 = `env.DEMO_MODE` read after `connection()`: the same build answers 200 without it and 404 with it
- [x] Token values: `/styleguide` color values equal the `DESIGN.md` hex values

## Acceptance-criteria coverage
- AC-1 command 2 · AC-2 styleguide step, command 1 · AC-3 command 6 · AC-4 commands 1 to 3 · AC-5 command 1 (reimport path is the mapping layer only) · AC-6 command 3, type roles on `/styleguide` · AC-7 styleguide and tooltip steps · AC-8 load and tile steps · AC-9 styleguide step, command 5 · AC-10 first, second and last UI steps · AC-11 first and third UI steps · AC-12 load, reload and failure steps · AC-13 dialog steps · AC-14 documents steps · AC-15 command 1 · AC-16 focus and motion steps · AC-17 command 4 · AC-18 command 7
