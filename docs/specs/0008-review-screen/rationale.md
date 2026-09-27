# 0008. Review screen: rationale

The decision record behind [index.md](index.md). `/develop` builds from the index and can skip this file.

## Context

The audit already works end to end without a screen for judging it. The six checks store 8 findings on the sample, each with a title, a calculation and evidence items that say exactly where every figure was read (`lib/checks/evidence.ts`, spec 0004). `lib/db/audit.ts` already has `listFindings` (largest first, with each finding's decision state) and `decide` (Approve or Reject by finding key, with a reason required to reject, replacing any earlier decision). Spec 0007 built the look (`DESIGN.md`, "Highlighter Ledger"), the shared pieces (`Money`, `SummaryTile`, `Chip`, `Table` with a selected row, `Dialog`, `Textarea`), the `(app)` shell and a `/review` stub that shows only the headline tiles.

What is missing is the working surface the brief's definition of done calls for: "Approve / Reject works and the export reflects the decisions." An AP analyst needs to see a finding and the proof beside it at the same time. For an invoice, the proof is the wrong figure on the invoice set against the contract price and the quantity received. `DESIGN.md` is specific about this surface: a split pane, a paper invoice in a recessed well, amber only on the flagged line, a Honey swipe only on the wrong figure, an evidence line in mono, a decision bar, a reason dialog, and ↑ ↓ A R keys. The Claude Design wireframes offer three layouts (1a split pane, 1b ledger, 1c queue) plus the reject dialog (1f).

The forces: the LLM never computes money and `lib/checks/` stays pure (root `AGENTS.md`); the brief's numbers ($9,766.85, 18.1%, 8 findings) are the acceptance test; the demo is public with no accounts and one shared SQLite database on a single replica; the time box is two to three evenings for the whole public demo; and the screen is what the demo recording and README screenshot will show. Two data gaps exist today. The stored finding does not say which invoice line or figure is wrong in structured form, only in evidence locators and labels. And nothing outside the checks knows each invoice line's contract price or received quantity.

If this is not decided, `/develop` would have to invent where the selection lives, how highlights are found, and where the line facts come from. Each of those is a place where the screen could quietly disagree with the audit.

## Options considered

The main decision is how the page is built and where the selection lives. Layout (1a) was the engineer's pick and matches `DESIGN.md`, so all three options below draw the same split pane.

### Option 1: One client component holding the selection

The server page loads all findings and every invoice view, then hands them to one client component that keeps the selected key in React state and draws the table and detail.

**Pros**:
- Instant selection changes and arrow key movement, with no server round trip.
- Simple mental model: one component, one state value.

**Cons**:
- A reload loses your place, and a finding cannot be linked or shared.
- Every invoice, line and evidence item ships to the browser up front as props, and the whole screen becomes client code.
- The stacked layout under 1024px needs its own view state and history handling to get a working back button.

### Option 2: Server rendered split pane, selection in the URL (chosen)

`/review?finding=<key>` renders on the server. Rows are links, and the page draws only the selected invoice. Small client pieces handle the decision bar, the dialog and the keys. One Server Action wraps `decide` and returns the next pending key.

**Pros**:
- A reload keeps the selection, the back button works, and every finding has a URL (handy for the demo recording).
- Only one invoice view is built per request, and most of the screen stays server code, matching the app's conventions (`connection()`, thin actions, `revalidateAudit()`).
- The narrow layout falls out of it: param present means show the detail, param absent means show the list.

**Cons**:
- Each selection change is a server render. That is fast on local SQLite, but slower than pure client state.
- Arrow keys drive navigation through `router.replace`, which needs care so the view does not scroll jump.

### Option 3: Nested route per finding

`/review/[findingKey]` as its own page, with a shared layout holding the tiles and table.

**Pros**:
- Clean URLs, and each finding is naturally its own page on mobile.
- Next's layouts keep the table mounted between findings.

**Cons**:
- The split pane then spans a layout and a page, and the "no param means select the largest" rule needs a redirect from `/review`.
- More files and more routing rules for the same result as a search param, with no gain the demo can show.

### Sub decisions weighed during the design conversation

| Question | Chosen | Runner up and why it lost |
|---|---|---|
| Highlight source | Derive from evidence locators and labels | Structured `{ lineNo, field }` on each finding: sturdier, but it touches all six checks, the schema, a migration and the live parity test for a screen concern |
| Qty received and Contract price | Pure lookup in `lib/checks` using `buildContext` | Evidence only: leaves most cells empty, so clean lines look unproven. A SQL join would duplicate matching rules the checks own |
| Tiles | Approved in money, Pending as a count | Both in money: the pending dollar figure matters less than how many are left |
| After a decision | Next pending | Stay put: slower through a queue of eight, and it fights the keyboard flow |
| Changing a decision | Switch between approved and rejected, no undo | Undo to pending: a third button and a delete path for a rare need that Load sample data already covers |
| Demo state | Shared | Per visitor decisions: a session column that ripples into the reload guard and Export, which is too much for a portfolio demo |
| Rate limiting | Bounded input only | In memory limiter: resets on restart and guards a fixed 8 row upsert. Revisit with Cloudflare at deploy |

## Rationale

Option 2 wins because the screen's job is judging one finding at a time against its proof, and the proof is server data. Keeping the selection in the URL gives a reload safe, linkable place in the queue (Context: the demo recording and the "decisions survive a reload" check) for almost nothing. It also keeps the page in the app's existing shape: server pages that call `lib/`, thin actions, and `revalidateAudit()` after every write. Option 1's instant selection is real, but the cost is shipping every invoice to the client and rebuilding reload and back button behavior by hand. Option 3 gets the same URLs with more routing machinery.

The highlight and line fact choices follow one principle: the screen must never disagree with the audit. Deriving highlights from the evidence the checks already wrote means the paper marks exactly what the calculation cites. Moving the label strings into shared constants turns a silent drift into a type error. Looking up contract price and received quantity through `buildContext` means the paper shows the same contract and the same receipts the checks used, and the screen still computes no money (the root rule). The weakness, a new check's label not being in the map, is guarded by a test that covers every invoice label the six checks emit today (not just the sample's), and it is noted in Consequences.

The engineer's picks all lean toward the smallest complete version (Skateboard): no schema change, no undo, shared demo state, no limiter. Each of those is cheap to revisit later without rework, which is why they are safe to defer. The follow ups in the index name where each one would come back.
