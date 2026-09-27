# 0007. Rationale: design system and UI foundation

## Context

The app has a working audit engine and one plain upload page styled with stock Tailwind greys. Release 3 adds the review screen and export, and Release 4 adds a landing page and a social card. All of them need to look like one careful finance tool. `DESIGN.md` (Highlighter Ledger) already fixes the visual language: the palette, three typefaces, a 4px grid, flat depth, and strict jobs for each color. Amber, for example, marks money overpaid and nothing else. What it does not say is how those values become code, how they reach Tailwind v4 and shadcn, or what shell and routes the next screens sit in.

The token values are going to come from a Claude Design (claude.ai/design) export. The owner will build the design system there from `DESIGN.md` and bring the result back. That export's variable names and color format are not known ahead of time, and it may be reimported more than once. So the repo has two sources of the same values: the export (what ships) and `DESIGN.md` (what is right). In this palette a wrong value matters. None of the given colors can carry text on white, and amber carries meaning.

shadcn/ui (spec 0001) brings its own variable vocabulary (`--primary`, `--secondary`, `--muted`, `--ring`). One of those names, `secondary`, means something different in `DESIGN.md` (Frozen Water: "this row" and "approved"). The copied components need to look right on arrival, without drifting from `DESIGN.md`'s names.

The build approach is Skateboard, and the time box is tight (2 to 3 evenings for the whole demo). The foundation has to be small enough to finish, but real enough that Feature 10 builds from parts. It also has to be verifiable: the scope's done check is "the base components render".

## Options considered

### Option 1: Verbatim export, mapping layer, drift test, restyled shadcn plus shared pieces

The export lands untouched in `app/styles/design-tokens.css`. `globals.css` maps it into Tailwind (`@theme inline`) and shadcn variables, and a test checks each value against `DESIGN.md`. shadcn primitives are added and restyled, plus four shared domain pieces (Chip, Money, SummaryTile, AppBar). It is shown on `/styleguide`, a `/review` stub and the restyled `/documents`.

**Pros**:
- A reimport never touches components or wiring, and naming differences are absorbed in one place.
- The test turns "stay true to `DESIGN.md`" from a hope into a check, including across color formats.
- Feature 10 starts with its tiles, chips, table and dialog done.

**Cons**:
- Two layers of variables to understand (`--ds-*` source, Tailwind tokens).
- Adds a test that parses YAML and CSS, which needs light maintenance if `DESIGN.md`'s format changes.

### Option 2: Paste the export into `globals.css`

Merge the exported values straight into `globals.css`, next to the Tailwind and shadcn wiring.

**Pros**:
- One file and no indirection. Easy to read.

**Cons**:
- Every reimport is a manual merge into a file that also holds wiring, which is exactly where drift creeps in.
- Nothing notices when the export disagrees with `DESIGN.md`.

### Option 3: Codegen from `DESIGN.md` (no Claude Design in the loop)

A script reads the `DESIGN.md` front matter and writes the token CSS, like `generate:sample` does for the sample data.

**Pros**:
- One source, with no drift possible by construction.

**Cons**:
- It ignores the owner's choice to produce tokens in Claude Design, and a generator becomes one more tool to keep working.

### Option 4: Primitives only, shell and pages left to Feature 10

Wire the tokens and restyle the shadcn primitives, and stop there.

**Pros**:
- The smallest foundation, finished fastest.

**Cons**:
- The chips, money figure and tiles get built inside Feature 10 under time pressure. The upload page stays off system with no feature to fix it, and the scope's done check has nothing real to render on.

## Rationale

Option 1 is chosen because the owner's decision that tokens come from Claude Design creates exactly the two source problem this option is built for. Keeping the export verbatim means a reimport is a file copy, not a merge. Putting all naming in one mapping layer means the export can use any names and any color format. The drift test is the piece that makes the setup safe. In a palette where amber means money and no given color can carry text, a quietly wrong hex is a correctness bug, not a style nit. Converting colors to sRGB before comparing lets an `oklch()` export pass when it is really the same color.

Letting `DESIGN.md` names win the Tailwind namespace (with shadcn's names as aliases) follows from the fact that every screen spec and every rule in `DESIGN.md` speaks in its names. The one collision, `secondary`, is resolved in favor of `DESIGN.md`, because the approved chip and the selected row use it daily, while shadcn's grey secondary button doesn't exist in this design (its secondary button is White with a Pencil outline). The cost, that later shadcn components need a restyle on arrival, is real but small, since components are added once and owned.

Building the shell, the review stub, the documents restyle and the Load sample data button here, rather than in Feature 10, matches Skateboard. The foundation ships as a usable whole (open the app, load the sample, see $9,766.85 in the real tiles), and Feature 10 grows it instead of starting it. The documents page has no other feature in the scope, so this is its only chance to join the system. The reload guard asks only when decisions exist, so the demo keeps a one click first run while an analyst's work is never wiped by a mis click.

### Settled without asking (implementation calls)

- **Typography as `@utility type-<role>`** rather than Tailwind `--text-*` tokens alone. Plex Mono amounts need family, size and `tnum` features together every time. One utility makes "money in the sans" hard to write by accident. Runner up: `--text-*` tokens plus separate `font-mono` and `tabular-nums` classes, which is easier to get wrong.
- **Keep Tailwind's default 4px spacing step** instead of `DESIGN.md`'s `xs`…`4xl` names. It is already 4px, so `p-4` is `DESIGN.md`'s `lg`, and names like `--spacing-md` would sit confusingly beside `max-w-md`. Only the layout names (`row-height`, `gutter`, `page`, `app`, `measure`) are added. Runner up: add all names, which duplicates the scale.
- **`lib/utils.ts` for `cn`** (shadcn's default alias), so every future `shadcn add` resolves without editing. Runner up: `lib/ui/cn.ts`, which is tidier but breaks the CLI's defaults.
- **Shared domain pieces in `components/`** beside `components/ui/`, since they are reused across routes and are not shadcn copies. Runner up: `app/_components/`, which is route local.
- **`tw-animate-css` kept** because the shadcn Dialog and Menu rely on its enter and leave classes. Durations and easings are overridden to `DESIGN.md` values.
- **`countDecisions` counts every stored row**, including decisions that now read as pending after an amount change, because `resetAll` deletes those too, and the dialog is about what gets deleted.
- **`loadSampleData` uses `uploadStore()`, not `ingestDeps()`**, so pressing the button never constructs a model client, and the demo stays keyless.
- **Destructive button in the reload guard**, with a one line `DESIGN.md` amendment. Wiping decisions is destructive, and a primary teal "Reload" would read as the safe next step. Runner up: a primary button, which keeps `DESIGN.md` unchanged but misleads.
- **Amber guard as a text scan test**, not an ESLint rule. It is cheap, it sits beside the drift test, and the allowlist is easy to grow. Runner up: a custom ESLint rule, which is more precise but more code to own.
