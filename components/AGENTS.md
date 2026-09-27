# components

Shared UI for every screen, built to `DESIGN.md` ("Highlighter Ledger"). Governing spec: [0007 design system and UI foundation](../docs/specs/0007-design-system-ui-foundation/index.md). Live showcase of every piece in every state: `/styleguide` (404 when `DEMO_MODE=true`).

## Files

- `ui/`: shadcn primitives (`components.json`, style `new-york`, Radix, Lucide icons) restyled to `DESIGN.md`: `button` (variants `primary`, `secondary`, `destructive`, `ghost` for icon only), `input`, `textarea`, `dialog`, `dropdown-menu`, `tooltip`, `table` (a `data-selected` row is the one under examination).
- `money.tsx`: `Money`, the only way an amount is rendered. Takes integer cents, prints `formatCents` output, always with cents. `size` `md` | `lg` | `display` (`display` is reserved for the recoverable tile).
- `summary-tile.tsx`: `SummaryTile`, a label over one figure; variant `recoverable` is the Amber Wash tile.
- `chip.tsx`: `Chip` with `state` `pending | approved | rejected | working`; pass `label` to reuse a look with other words (upload statuses do).
- `app-bar.tsx`: `AppBar`, rendered by `app/(app)/layout.tsx` with the decision count for the reload guard. It imports `LoadSampleButton` and `NavLink` from `app/(app)/_components/` on purpose (spec 0007's component contract): the one place `components/` reaches into `app/`, so keep it that way rather than moving them.

## Conventions

- Add primitives with the shadcn CLI, then restyle them to `DESIGN.md`. Join classes with `cn` from `@/lib/utils`.
- Style with Tailwind utilities and the `type-<role>` utilities only. Never read a token file variable (`var(--ds-…)`) or name `design-tokens.css` here; `app/styles/design-tokens.test.ts` fails the build on it.
- Amber (`tertiary*`) is allowed only in `summary-tile.tsx` and `chip.tsx` (working state); the same test enforces the allowlist.
- Light mode only: no `dark:` classes.
- Every state carries a word and an icon, never color alone. Focus rings and motion come from `app/globals.css`; never remove a `:focus-visible` style.

_Drafted by /sync from the introducing change, worth a quick human pass._
