---
version: alpha
name: Highlighter Ledger
description: Light-mode design system for the AI Invoice Overpayment Auditor, a dense review tool for AP analysts with a one-time pitch page for prospective clients.

colors:
  # Light Sea Green (given): the action colour. Always carries ink, never white.
  primary: "#2EC4B6"
  primary-hover: "#27B1A8"
  # Derived deep teals: the only teal allowed as text or outline.
  primary-deep: "#016968"
  primary-deeper: "#044E50"
  # Frozen Water (given): the row under examination, and approved.
  secondary: "#CBF3F0"
  # Amber Glow (given): the flag. Marks money found, nothing else.
  tertiary: "#FF9F1C"
  # Honey Bronze (given): the highlighter swipe on the figure that is wrong.
  tertiary-soft: "#FFBF69"
  tertiary-wash: "#FFF5E3"
  tertiary-deep: "#90531D"
  # White (given): the paper every document and table sits on.
  surface: "#FFFFFF"
  on-surface: "#112123"
  on-surface-muted: "#526162"
  outline: "#838F90"
  border: "#D9E1E2"
  neutral: "#F4F9F9"
  neutral-well: "#EAF2F2"
  error: "#A44120"
  error-wash: "#FFEFE8"

typography:
  display-xl:
    fontFamily: Instrument Serif
    fontSize: 88px
    fontWeight: 400
    lineHeight: 1.0
    letterSpacing: -0.025em
  display:
    fontFamily: Instrument Serif
    fontSize: 48px
    fontWeight: 400
    lineHeight: 1.05
    letterSpacing: -0.015em
  headline-lg:
    fontFamily: Instrument Serif
    fontSize: 32px
    fontWeight: 400
    lineHeight: 1.15
    letterSpacing: -0.01em
  headline-md:
    fontFamily: IBM Plex Sans
    fontSize: 20px
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: -0.005em
  headline-sm:
    fontFamily: IBM Plex Sans
    fontSize: 16px
    fontWeight: 600
    lineHeight: 1.35
  body-lg:
    fontFamily: IBM Plex Sans
    fontSize: 17px
    fontWeight: 400
    lineHeight: 1.6
  body-md:
    fontFamily: IBM Plex Sans
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.5
  body-sm:
    fontFamily: IBM Plex Sans
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: 0.005em
  label-md:
    fontFamily: IBM Plex Sans
    fontSize: 13px
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: 0.005em
  label-caps:
    fontFamily: IBM Plex Sans
    fontSize: 11px
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: 0.08em
    fontFeature: "'case' 1"
  caption:
    fontFamily: IBM Plex Sans
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: 0.01em
  data-lg:
    fontFamily: IBM Plex Mono
    fontSize: 22px
    fontWeight: 400
    lineHeight: 1.2
    letterSpacing: -0.01em
    fontFeature: "'tnum' 1, 'zero' 1"
  data-md:
    fontFamily: IBM Plex Mono
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.45
    fontFeature: "'tnum' 1, 'zero' 1"
  data-md-strong:
    fontFamily: IBM Plex Mono
    fontSize: 13px
    fontWeight: 600
    lineHeight: 1.45
    fontFeature: "'tnum' 1, 'zero' 1"

rounded:
  none: 0px
  xs: 2px
  sm: 4px
  md: 6px
  lg: 10px
  full: 9999px

spacing:
  base: 4px
  xxs: 2px
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  2xl: 32px
  3xl: 48px
  4xl: 80px
  row-height: 36px
  gutter: 24px
  page-margin: 32px
  app-max-width: 1440px
  measure: 68ch

components:
  page:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-md}"
  app-bar:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.on-surface}"
    typography: "{typography.headline-sm}"
    height: 56px
    padding: "{spacing.xl}"
  divider:
    backgroundColor: "{colors.border}"
    height: 1px
  link:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary-deep}"
    typography: "{typography.body-md}"

  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-surface}"
    typography: "{typography.label-md}"
    rounded: "{rounded.md}"
    height: 36px
    padding: "{spacing.lg}"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
    textColor: "{colors.on-surface}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.label-md}"
    rounded: "{rounded.md}"
    height: 36px
    padding: "{spacing.lg}"
  button-secondary-hover:
    backgroundColor: "{colors.neutral-well}"
    textColor: "{colors.on-surface}"
  button-destructive:
    backgroundColor: "{colors.error}"
    textColor: "{colors.surface}"
    typography: "{typography.label-md}"
    rounded: "{rounded.md}"
    height: 36px
    padding: "{spacing.lg}"

  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-md}"
    rounded: "{rounded.sm}"
    height: 36px
    padding: "{spacing.md}"
  input-outline:
    backgroundColor: "{colors.outline}"
    height: 1px
  input-error:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.error}"
    typography: "{typography.caption}"
  focus-ring:
    backgroundColor: "{colors.primary-deep}"
    height: 2px

  summary-tile:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.on-surface}"
    typography: "{typography.data-lg}"
    rounded: "{rounded.md}"
    padding: "{spacing.lg}"
  summary-tile-label:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.on-surface-muted}"
    typography: "{typography.label-caps}"
  summary-tile-recoverable:
    backgroundColor: "{colors.tertiary-wash}"
    textColor: "{colors.on-surface}"
    typography: "{typography.display}"
    rounded: "{rounded.md}"
    padding: "{spacing.lg}"

  table-header:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.on-surface-muted}"
    typography: "{typography.label-caps}"
    height: 32px
    padding: "{spacing.md}"
  finding-row:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-md}"
    height: "{spacing.row-height}"
    padding: "{spacing.md}"
  finding-row-hover:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.on-surface}"
  finding-row-selected:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.on-surface}"
  amount-cell:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.data-md}"

  invoice-well:
    backgroundColor: "{colors.neutral-well}"
    textColor: "{colors.on-surface-muted}"
    typography: "{typography.caption}"
    padding: "{spacing.xl}"
  invoice-paper:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.data-md}"
    rounded: "{rounded.none}"
    padding: "{spacing.2xl}"
  flagged-line:
    backgroundColor: "{colors.tertiary-wash}"
    textColor: "{colors.on-surface}"
    typography: "{typography.data-md}"
  flag-marker:
    backgroundColor: "{colors.tertiary}"
    width: 3px
    rounded: "{rounded.xs}"
  highlight-swipe:
    backgroundColor: "{colors.tertiary-soft}"
    textColor: "{colors.on-surface}"
    typography: "{typography.data-md-strong}"
    rounded: "{rounded.xs}"
    padding: "{spacing.xxs}"
  evidence-line:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.on-surface}"
    typography: "{typography.data-md}"
    rounded: "{rounded.sm}"
    padding: "{spacing.md}"
  citation:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface-muted}"
    typography: "{typography.caption}"

  chip-pending:
    backgroundColor: "{colors.neutral-well}"
    textColor: "{colors.on-surface-muted}"
    typography: "{typography.label-md}"
    rounded: "{rounded.sm}"
    padding: "{spacing.xs}"
  chip-approved:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.primary-deeper}"
    typography: "{typography.label-md}"
    rounded: "{rounded.sm}"
    padding: "{spacing.xs}"
  chip-rejected:
    backgroundColor: "{colors.error-wash}"
    textColor: "{colors.error}"
    typography: "{typography.label-md}"
    rounded: "{rounded.sm}"
    padding: "{spacing.xs}"
  chip-working:
    backgroundColor: "{colors.tertiary-wash}"
    textColor: "{colors.tertiary-deep}"
    typography: "{typography.label-md}"
    rounded: "{rounded.sm}"
    padding: "{spacing.xs}"

  drop-zone:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.on-surface-muted}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    padding: "{spacing.2xl}"
  drop-zone-active:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.primary-deeper}"

  dialog:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-md}"
    rounded: "{rounded.lg}"
    padding: "{spacing.xl}"
  tooltip:
    backgroundColor: "{colors.on-surface}"
    textColor: "{colors.surface}"
    typography: "{typography.caption}"
    rounded: "{rounded.sm}"
    padding: "{spacing.sm}"

  landing-hero:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.display-xl}"
    padding: "{spacing.4xl}"
  landing-body:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface-muted}"
    typography: "{typography.body-lg}"
    width: "{spacing.measure}"
  social-card:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.on-surface}"
    typography: "{typography.display-xl}"
    width: 1200px
    height: 630px
    padding: "{spacing.4xl}"
---

# Highlighter Ledger

## Overview

The auditor's job has a physical ancestor: a stack of printed invoices, a contract beside them, and a highlighter pen run over every figure that doesn't match. This system turns that desk into a screen. White paper for the documents, dark ink for the figures, and a highlighter used on the money and nothing else.

It serves two audiences on two kinds of surface:

- **The review screen and the documents page** are working tools. An AP analyst sits with them for an hour, reads a table, compares two numbers and makes a call. These surfaces are dense (14px body, 36px rows, 4px grid) and quiet, and they are built like a spreadsheet done well.
- **The landing page and the social card** are seen once, by a prospective client on Upwork, for about 20 seconds. They make one big gesture: the recovered figure, set huge in a serif with a highlighter swipe behind it.

The direction is **Ledger Paper in structure, with the owner's palette**: a utility-dense grid, hairline rules instead of shadows, tabular monospace for every amount, and a display serif kept for the few figures that tell the story. The palette (Light Sea Green, Frozen Water, Amber Glow, Honey Bronze, White) is fixed. The identity comes from the strict jobs each colour gets, not from the colours themselves.

**What it gives up:** decoration, novelty and "AI product" polish. There are no gradients, glows, illustrations or animated reveals. The product looks like a careful accountant's tool on purpose, because the buyer's first question is "can I trust these numbers?" and ornament makes that answer worse.

## Colors

Every colour in the palette is light: the darkest one, Light Sea Green, sits at OKLCH lightness 0.74. None of them can carry text on white (the best manages 2.2:1), and white text on them fails too. So the given colours are **always fills with dark ink on top**, and each hue gets a darker derived shade for when it has to be text or an outline. Derived shades were built in OKLCH with the hue bending as it darkens (teal 185° → 198°, amber 73° → 58°) and chroma tapering at the ends, then converted to hex.

**The action family (teal)**
- **Light Sea Green (`primary`):** the go signal. It fills every button that moves the audit forward: Load sample data, Approve, Export, Choose files. It carries dark ink (7.6:1), never white. Dark text on a bright fill is the system's most recognisable move.
- **Sea Green, pressed (`primary-hover`):** the hover and active fill, one step darker. Ink still reads at 6.3:1.
- **Deep Lagoon (`primary-deep`):** the only teal allowed to be text or a line: links, the 2px focus ring, the selected-row edge. 6.5:1 on white.
- **Deeper Lagoon (`primary-deeper`):** text on Frozen Water, used for the approved chip and the active drop zone (8.0:1).
- **Frozen Water (`secondary`):** the pale cyan band of a continuous-feed audit printout. It marks the one row under examination and approved decisions. It is never a page or panel background.

**The flag family (amber)**. This is the accent, and it has exactly one job: **it marks money the client overpaid.** If a pixel is amber, a dollar is involved.
- **Amber Glow (`tertiary`):** the flag. A 3px marker on the left edge of every flagged invoice line, and the underline on the recoverable total. It stays below 2% of any screen.
- **Honey Bronze (`tertiary-soft`):** the highlighter itself. A swipe behind the specific figure that is wrong: the billed $5.10 next to the contract's $4.85, the 40 belts billed but not received. Only on the wrong figure, never on the whole row.
- **Amber Wash (`tertiary-wash`):** the faint tint of a highlighted line on paper. It fills the flagged invoice line and the recoverable tile.
- **Burnt Amber (`tertiary-deep`):** amber as text, only for "working" states (in progress, uploading) on Amber Wash.

**Paper and ink**. The neutrals carry a trace of the sea-green hue (OKLCH chroma 0.005 to 0.022 at hue about 200), so the greys sit with the teal rather than beside it.
- **White (`surface`):** the paper. The page, the table, the invoice. White comes from the palette and is kept as the document stock; everything around it is tinted.
- **Harbour Ink (`on-surface`):** a near-black with a cold sea cast. All primary text, every amount, the text on every bright fill.
- **Slate Water (`on-surface-muted`):** secondary text, table headers, tile labels, citations. At least 5.4:1 on every surface it touches.
- **Pencil (`outline`):** input borders and control outlines. At 3.3:1 it meets the 3:1 rule for UI components. Never use it for text.
- **Rule (`border`):** the 1px hairline between rows, panels and sections.
- **Canvas (`neutral`):** the app bar, table headers, summary tiles. One step off white, so paper stays distinct from the desk.
- **Desk (`neutral-well`):** the recessed well the invoice paper sits in, and pending chips.

**Error**
- **Rust (`error`) and Rust Wash (`error-wash`):** amber bent toward red, so an error looks like it came from this palette. Used for rejected findings, refused or failed uploads, and the destructive confirm button. Never use stock red.

Never use colour alone to carry state. Every chip has a word and an icon, every flagged line has a marker as well as a tint, and the wrong figure has a swipe as well as a bold weight.

## Typography

Three faces, each with one job and no overlap:

- **IBM Plex Sans** is the interface voice: labels, buttons, body copy, headings inside the app. It was drawn for IBM, whose machines printed the first computer ledgers, and it has an engineered warmth that stays legible at 13px. It uses weights 400 and 600 only. 700 clogs at dense UI sizes, and 500 is too close to 400 to register.
- **IBM Plex Mono** is the apparatus: every amount, quantity, unit price, invoice number, PO number, and the evidence calculation `($5.10 − $4.85) × 1,500 = $375.00`. Tabular figures (`tnum`) keep columns aligned to the cent, and the slashed zero (`zero`) separates 0 from O in IDs like `NL88310`. Money is always mono; a dollar figure in the sans is a bug.
- **Instrument Serif** is for display only, never below 32px: page titles, the recoverable figure in its tile, the landing headline, the social card. It is the "result" voice, the one number you'd read aloud to a CFO. It ships in weight 400 only; never let the browser fake a bold.

The scale is a minor third (≈1.2) from a 14px app body, broken at the display end: 32 → 48 → 88. The body-to-display jump should feel like a jump. Tracking tightens as size grows (−0.025em at 88px) and opens on uppercase labels (+0.08em, with the `case` feature on). Line height goes from 1.0 at display to 1.6 for landing prose.

Load all three through `next/font/google` (self-hosted at build time, OFL licensed, Latin subset). Fallback stacks: Plex Sans → `system-ui, -apple-system, "Segoe UI", sans-serif`; Plex Mono → `ui-monospace, "SF Mono", Menlo, monospace`; Instrument Serif → `Georgia, "Times New Roman", serif`.

## Layout

Everything sits on a **4px grid**. Structure follows the content: the app is tables and aligned columns, and the landing page is one large figure with text beside it.

**Review screen (the core surface).** Full width up to 1440px, 32px side margins.
1. **App bar** (56px, Canvas): product name at left; *Load sample data* (primary), *Export* (secondary; .xlsx and .csv) and a *Documents* link at right.
2. **Summary tiles**: one row, deliberately asymmetric. *Recoverable* takes 2 of 5 columns, with the figure in the serif display and an Amber Glow underline. *Approved*, *Pending* and *% of invoiced* share the other 3, with figures in mono `data-lg`. The recoverable tile is the only large element above the fold.
3. **Split pane**: the findings table on the left (5 of 12 columns) and the detail panel on the right (7 of 12), with a 24px gutter.
   - **Findings table**: sorted by recoverable amount, largest first. Columns: supplier, invoice, finding type, decision chip, amount (right aligned, mono). Rows are 36px, separated by 1px Rule lines; no zebra striping. The selected row turns Frozen Water and gets a 2px Deep Lagoon edge on the left.
   - **Detail panel**: invoice number and supplier (`headline-md`), then the **invoice well**. The invoice is drawn as a sheet of White paper, square cornered, sitting in the Desk well. Its lines are in a table with columns *Line · Qty billed · Qty received · Unit price billed · Contract price · Amount*. Flagged lines get an Amber Wash fill and a 3px Amber Glow marker; the specific wrong figures get a Honey swipe. Below the paper come the **evidence line** (mono, Canvas fill) and **citations** (file name and clause, `caption`, Slate Water). The panel ends with a **decision bar** docked to its bottom: *Approve* (primary) and *Reject* (secondary). Reject opens the reason dialog, and a reason is required.
   - Under 1024px the split stacks: the table on top, and the detail opens as a full-width page with a back link.

**Documents page (intake).** Width capped at 880px and left aligned (not centred). A drop zone (Canvas, 1px dashed Pencil border), then one row per file: file name, document kind, status chip, and retry for failures. Refusal reasons sit under their row in Rust `caption`.

**Landing page.** Flush left and asymmetric: text in a 7-column block at the left, with the right side mostly empty space. The headline figure "$9,766.85" is set in `display-xl` with a Honey swipe behind it. Beneath it runs one sentence of `body-lg` capped at 68ch, then *Try the demo* (primary). Below the fold, the six checks are a plain numbered list with Rule hairlines between items, not cards. Sections get 80px of space above and 32px below, so each heading belongs to the text that follows it.

**Social card (1200×630).** Canvas background, the recovered figure in `display-xl` with a Honey swipe, and one line of `headline-md` under it ("found in 12 documents, in under a minute"), 80px padding. A 12px Amber Glow bar runs down the left edge.

Body prose is capped at 68ch everywhere. Tables are the exception: they fill their pane.

## Elevation & Depth

The system is **flat, built from paper and desk**. Depth comes from tonal layers and 1px hairlines, not shadows:

- Canvas (the desk) sits behind White (the paper). The invoice paper sits in the Desk well. That tonal step is the whole depth model for static content.
- Panels, tables and tiles are separated by 1px Rule lines. Tiles have a Canvas fill and no border.

Shadows are reserved for things that really float above the page: the reject dialog, the export menu and tooltips. They take one two-layer shadow, lit from above, coloured from Harbour Ink rather than black:
`0 1px 2px rgba(17, 33, 35, 0.10), 0 8px 24px rgba(17, 33, 35, 0.12)`.
The dialog backdrop is Harbour Ink at 32% opacity. Nothing static ever takes a shadow.

## Shapes

Radius depends on the kind of object:

- **0px:** the invoice paper, table cells and the social card. Documents are square because paper is square.
- **2px (`xs`):** the flag marker and the highlighter swipe, which should read as a mark on the paper.
- **4px (`sm`):** inputs, chips and tooltips.
- **6px (`md`):** buttons, summary tiles and the drop zone.
- **10px (`lg`):** the dialog, the only surface that floats.
- **Full:** only the 8px status dot inside a chip.

Borders are 1px throughout. Rule (`border`) separates content; Pencil (`outline`) outlines controls that take input (inputs, the secondary button, the drop zone, which is dashed). Focus is a 2px Deep Lagoon ring with a 2px White offset on every focusable element, and it is never removed.

## Components

- **Buttons.** Primary is Light Sea Green with Harbour Ink text: one per region, used for the next step forward. Secondary is White with a Pencil outline. Destructive (Rust with White text) appears only as the confirm button inside a confirm dialog (reject, reload sample), never directly on the page. Buttons are 36px tall, the label is in `label-md`, and an optional 16px icon sits to the left. Disabled buttons keep their shape at 45% opacity with no hover.
- **Summary tiles.** Label on top (`label-caps`, Slate Water), figure below. Recoverable uses the serif `display` on Amber Wash with a 2px Amber Glow underline under the figure. The other three use mono `data-lg` on Canvas. Figures are always complete: `$9,766.85`, never `$9.8k`.
- **Findings table.** The amount column is right aligned in mono and always shows cents. The finding type is plain text ("Duplicate, paid twice", "Price above contract"). The decision chip sits beside it. Keyboard: ↑/↓ moves the selection, A approves, R opens reject.
- **Chips.** Pending (Desk, Slate Water, empty circle icon), Approved (Frozen Water, Deeper Lagoon, check icon), Rejected (Rust Wash, Rust, cross icon), Working (Amber Wash, Burnt Amber, spinner or clock icon). Upload statuses map onto these: *done* and *already ingested* use Approved styling with their own words, *uploading* and *in progress* use Working, *failed* and *refused* use Rejected.
- **Invoice paper.** A mono table on White with a 32px margin, matching the layout of a printed invoice (supplier block, then lines, then totals). Flagged lines get Amber Wash plus the 3px Amber Glow marker. The wrong figure gets a Honey swipe and `data-md-strong`. The contract price and received quantity that prove it appear in their own columns, unhighlighted: the evidence stays plain and the error is what's marked.
- **Evidence line.** One line of mono on Canvas that shows the calculation exactly as the checks computed it, followed by citations in `caption`: "Invoice NL-88203.pdf, line 3 · Contract MSA-2024, clause 4.2".
- **Reject dialog.** A title, a required reason textarea (`input`), and Cancel (secondary) and Reject (destructive). Submitting an empty reason shows an `input-error` message under the field and moves focus back to the field. The dialog is 480px wide.
- **Drop zone.** Canvas with a 1px dashed Pencil border. On drag-over it turns Frozen Water with Deeper Lagoon text and a solid border. It contains one primary button, *Choose files*, and a caption giving the size limit.
- **Tooltips.** Harbour Ink with White text, `caption`, shown after a 400ms hover delay. Use them only for truncated IDs and icon-only buttons.
- **Icons.** Lucide at 16px with a 1.5px stroke, coloured Slate Water unless they are inside a chip or button. Never put icons in tinted squares, and never use them decoratively on the landing page.
- **Motion.** Motion exists only to confirm a state change: 120ms `ease-out` for hover, selection and chip changes; 180ms `cubic-bezier(0.2, 0, 0, 1)` for the dialog and menus entering, and 120ms `ease-in` for leaving. Numbers do not count up, sections do not fade in on scroll, and tables do not animate row changes. Respect `prefers-reduced-motion` by making all transitions instant.

## Do's and Don'ts

- Do put Harbour Ink on every Light Sea Green, Amber Glow and Honey fill. Don't put white text on any colour from the given palette; it fails AA on all of them.
- Do use amber only where money was overpaid. Don't use Amber Glow or Honey for warnings, badges, hover states or decoration. If it's amber, a dollar is involved.
- Do highlight only the wrong figure with the Honey swipe. Don't highlight whole rows, whole cells or the evidence figures.
- Do set every amount in IBM Plex Mono with tabular figures and cents: `$8,141.00`. Don't abbreviate money, round it, or set it in the sans.
- Don't set Instrument Serif below 32px or in a bold; it's for the result figures and page titles only.
- Do use at most one primary button per region. If two actions compete, the second is secondary.
- Don't use Frozen Water as a panel or page background. It means "this row" or "approved", and nothing else.
- Don't add shadows to tiles, tables, panels or the invoice paper. Only the dialog, menus and tooltips float.
- Don't encode state with colour alone. Every chip carries a word and an icon, and every flagged line carries a marker.
- Don't add a second accent or a gradient. If something needs emphasis, use size, weight or position.
- Don't centre the landing page or build it from cards. Keep it flush left, with one figure and a numbered list.
- Do keep the pure White for paper surfaces (page, tables, invoice, dialog). Chrome (app bar, headers, tiles) uses Canvas, so the document always reads as the brightest thing on screen.
