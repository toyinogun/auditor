# 0009. Export: rationale

The decision record behind [index.md](index.md). `/develop` builds from `index.md` and can skip this file.

## Context

The brief ends the analyst's job with "exports a claim list": the finding log as .xlsx and .csv, with the analyst's decisions and a total row. The acceptance list says "Approve / Reject works and the export reflects the decisions", and the scope's Done when adds that the total row must match the review screen after approvals and rejections. Spec 0001 already fixed the tools (`exceljs` for .xlsx, a small built in RFC 4180 writer for .csv) and the route (`GET /api/export?format=xlsx|csv`). `DESIGN.md` already fixed where it lives: a secondary Export button in the app bar, beside Load sample data, with a floating menu.

Two earlier specs disagreed about the total. Spec 0004 said the total row sums every `recover` finding (the Recoverable figure, $9,766.85 on the sample whatever the analyst does). Spec 0008 said it must equal the Approved tile, which reads $0.00 on a fresh sample and only reaches $9,766.85 once every money finding is approved. A single total row cannot satisfy both at every moment, and the scope's check ("matches the review screen after approvals and rejections") compares against a screen that shows both.

Other forces: the time box is 2 to 3 evenings; the public demo has no accounts and one shared audit; text in the file comes partly from outside the app (supplier names the model read, uploaded filenames, analyst reasons), which matters once a spreadsheet opens it; and the non ASCII characters the checks already write (`·` in citations, `−` in calculations) break in Excel when a .csv has no byte order mark.

## Options considered

### Option 1: Route handler that builds the file on each request (chosen)

The Export menu holds two plain links to `/api/export?format=…`. The route reads the review snapshot in one transaction, builds one table of rows and totals, and writes it as .csv or .xlsx into the response.

**Pros**:
- The route spec 0001 already named; a link download needs no client code and works everywhere.
- Always fresh: each click reflects the decisions made a moment ago.
- Easy to test: the handler takes a `Request` and returns a `Response`, like the ingest webhook.

**Cons**:
- The analyst sees nothing before the download opens.
- A public GET that anyone can hit (cheap, but not rate limited in the app).

### Option 2: Server Action that returns the bytes

The menu calls a Server Action that builds the file and returns it (base64 or bytes); the client turns it into a Blob and triggers a download through an object URL.

**Pros**:
- Server Actions carry Next's origin check, so the export cannot be linked to from another site.
- Keeps every UI mutation and read in `actions.ts`.

**Cons**:
- Client code for the Blob and object URL dance, and the file travels through React's action serialization.
- Not a real HTTP endpoint, so it breaks spec 0001's plan and cannot be fetched by a script or n8n later.
- Harder to name the file and set headers.

### Option 3: Claim preview page with download buttons (wireframe 1h)

A `/claim` page renders the table and totals as the file will contain them, with Download .xlsx and Download .csv buttons that use Option 1's route.

**Pros**:
- The analyst checks the claim before sending it; nice in a demo recording.
- Shows the totals reconcile on screen.

**Cons**:
- One more screen to design, build, and verify inside the time box.
- It duplicates what the review screen already shows (tiles plus table).

### Sub decisions weighed during the design conversation

- **Total row**: two rows (Recoverable and Approved) chosen over Approved only (reads $0.00 on a fresh sample, looks broken in a demo) and Recoverable only (ignores decisions, so it cannot prove "the export reflects the decisions").
- **Rows**: every finding with a Decision column, chosen over approved only (loses the audit trail of what was rejected and why) and a second claim sheet (more to build, deferred).
- **Pending**: allowed, since a snapshot export right after Load sample data is part of the demo flow; blocking until all are decided would stall it.
- **Money**: number cells with a `$` format in .xlsx (sortable and summable) over SUM formulas (some viewers show 0 until recalculated) and text (cannot be added up); a plain decimal in .csv over `$8,141.00` (parses as text).
- **Evidence**: one joined citation cell (same text as the screen) over a separate Evidence sheet (more to build) and full label and value text (long).
- **Encoding**: UTF-8 with BOM and CRLF, since the checks already write `·` and `−`, which Excel misreads without a BOM.
- **Run context**: a Summary sheet, so the Findings sheet stays a clean table with its filter on row 1.

## Rationale

Option 1 is the smallest thing that meets every force. It is the route spec 0001 already committed to, it reads fresh on every click so the file reflects decisions made seconds ago, and a plain link download needs no client state. Option 2 buys origin protection for a read of public demo data, which is not worth the client code or breaking the named endpoint. Option 3 is a good screen but not a requirement: the review screen already shows the same numbers, and the time box favours shipping the files. It stays in Follow-up.

The two total rows settle the clash between specs 0004 and 0008 by honouring both: Total recoverable is the headline, Total approved is the claim the analyst signed off. Because both come from the same functions the tiles call (`latestHeadline`, `reviewTotals`) and are read in one transaction with the rows, the file matches the screen by construction, not by a test that has to catch drift.

Building one table and handing it to two thin writers is what keeps the .xlsx and .csv the same. The formula guard lives only in the .csv writer, because .xlsx string cells are never evaluated, while every .csv cell can become a formula once a spreadsheet opens it, and some of the text comes from outside the app.
