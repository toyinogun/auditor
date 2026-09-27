# Review, feat/sample-data-generator, 2026-09-27

**Reviewed by**: Claude Sonnet 5 (author on Claude Sonnet 5)
**Scope**: 41 files, branch vs base (main, merge base 4f428db)
**Verdict**: Approve with nits

## Summary
This change adds the sample data generator described in spec 0003: a script under `scripts/generate-sample/` that turns the brief's fixture into 12 PDFs, two CSVs and a manifest, with a shared page model, two painters (pdfkit for text, canvas for the NL88310 scan), and an atomic folder swap into `public/sample/`. The work is careful and disciplined: money only ever goes through cents, dates are handled in UTC, randomness is seeded, and every acceptance criterion has a matching test. Typecheck, lint and the full test suite (199 tests) all pass, including the drift test against the committed output. The one real issue is a small gap in the atomic folder swap that could, in a rare failure, leave neither the old nor the new folder in place; everything else is polish.

## Minor
### 🟡 Swap step is not fully atomic, `scripts/generate-sample/write.ts:31`
**Problem**: `generateSampleFolder` calls `await rm(outputDir, ...)` and then `await rename(tempDir, outputDir)` as two separate awaited steps. If the process is interrupted or `rename` itself throws in that window (for example a Ctrl+C during the run, or a permissions problem), the `catch` block then removes `tempDir` too. That leaves neither the old `public/sample/` nor the freshly rendered one, which contradicts the documented guarantee in `scripts/generate-sample/AGENTS.md` and spec 0003 ("a failed run leaves the previous folder untouched", AC-1, and "public/sample/ is only ever replaced whole, never partly written").
**Why it matters**: The failure window is small and the script is developer only, and `public/sample/` is committed to git so the folder is recoverable with `git checkout` even in the worst case. That keeps this from being a major, but the code's own claim of atomicity is not quite true, and `write.test.ts` only exercises failure before this point (render failing, or a write failing), never a failure of the rm/rename swap itself.
**Suggested fix**: Rename the old `outputDir` to a backup path first, then rename `tempDir` into `outputDir`, and only delete the backup after that second rename succeeds; restore the backup in the catch block if the second rename fails. Optionally add a test that simulates the rename step failing.

## Nits
- ⚪ `scripts/generate-sample/render.ts:78`, the hand rolled `sequence` reducer (spread a growing array each step) is a clear expression of "never in parallel", worth a one line comment pointing at that rule so a future reader does not "simplify" it back into `Promise.all`.
- ⚪ `scripts/generate-sample/manifest.ts:24`, `toEntry` recomputes `sha256` per file; fine at this scale (15 small files), just flagging in case the generator ever grows to render much larger binaries.

## Strengths
- Every acceptance criterion in spec 0003 has a corresponding, well named test, and `render.test.ts` reads the PDFs back with `unpdf` rather than trusting the layout code, which is the right level of rigor for "every figure comes from the fixture."
- Money, dates and randomness discipline is followed everywhere: `formatMoney` always goes through `parseMoney`/cents, dates are computed in UTC, and the scan's noise uses a seeded `mulberry32`, never `Math.random`. The determinism tests (render twice, compare to committed files) actually enforce this instead of just asserting it in prose.
- The one page model feeding two painters (pdfkit and canvas) is a clean way to guarantee the scan and the text invoice can never drift apart, and the code stays properly split: `lib/schemas/` remains pure, only `scripts/generate-sample/` touches pdfkit/canvas, and app code never imports from `scripts/`.

## Test coverage
Full: every module (`validate`, `render`, `write`, `csv`, `format`, `sample-manifest`) has a dedicated test file, plus `render.test.ts` covers the acceptance criteria end to end (AC-1 through AC-9) against both an in-memory render and the committed `public/sample/` output. The only gap is the untested rename-failure window inside `generateSampleFolder` noted above.
