# 0002. Data model: decision record

## Context

Every later feature leans on these shapes. The generator (Feature 4) writes them, extraction (Feature 7) produces them through Claude tool calls, the six checks (Feature 5) read them, and the review screen and export (Features 10, 11) show findings and decisions. If the shapes drift between these features, offline mode and a real LLM run can disagree, and the acceptance test fails.

Correctness is exact: 8 findings, $9,766.85 recoverable, 18.1% of $53,939.60, to the cent, every run. The project rules say the LLM never computes money, `lib/checks/` stays pure, and only `lib/db/` touches SQLite (spec 0001). Every finding must show its calculation and the file and clause behind each figure.

Documents arrive in any order, through upload, n8n or the sample loader, and the same file can arrive twice. Duplicates by invoice number are a real state the checks must find, not an error. One document is a scan read from page images, where a misread digit is the most likely failure. The scale is tiny (a dozen documents), and the time box is short, so the model must stay small enough to build in an evening.

## Options considered

### Option 1: One JSON blob per document

Store each document's validated extraction as a JSON column on `documents`, with findings and decisions as JSON too. The checks parse the blobs.

**Pros**: fewest tables; the extraction shape is the storage shape; fastest to build.
**Cons**: money stays as printed strings, so every check parses money; no database constraints (uniqueness, overlap, reject reason); lookups like "all receipts for PO-4502" become scans in code.

### Option 2: Normalized relational model in cents, separate extraction and record shapes (chosen)

Relational tables per document type with integer cents, text business keys between documents, and three Zod layers (extraction as printed, records in cents, findings) joined by pure converters and DB mappers.

**Pros**: exact integer money everywhere after one conversion; the database enforces the invariants; the checks read typed records with no parsing; the offline and LLM paths share one converter.
**Cons**: the most code (15 tables, converters, mappers); two shape layers to keep in step.

### Option 3: Relational tables generated from Drizzle, Zod derived from them

Same tables as Option 2, but the Zod shapes are generated from Drizzle (`drizzle-zod`), and the checks read row types.

**Pros**: less hand written Zod; the table and type can never drift.
**Cons**: the checks and the LLM tool shape follow table layout (flat rows, snake case, ids); the extraction shape (strings, nesting) still has to be hand written; it couples `lib/checks/` types to the database.

## Rationale

The exact money requirement and the "LLM never computes money" rule decide most of it. Option 2 converts printed text to cents once, in one pure function shared by the offline and LLM paths, so the $9,766.85 test can only fail on check logic. That same converter is the natural place for the arithmetic guard, which is the cheapest defence against a misread digit on the scanned invoice. Option 1 pushes money parsing into every check, and gives up the database constraints that make duplicate files, overlapping contracts and blank reject reasons impossible rather than merely unlikely.

Option 3 was the closest runner up. It was rejected because the checks must stay pure and readable by a client reviewing the repo; typed nested records (`invoice.lines[].unitPriceCents`) read better than joined rows, and the extraction layer still needs its own hand written shape anyway.

The smaller calls, each chosen with you:
- **Business keys, not foreign keys, between documents**: files arrive in any order, and "no PO found" and duplicate invoice numbers are states the checks must report. Runner up: FKs resolved at ingest with a pending link fixup.
- **Decisions keyed by a stable finding key, with an amount snapshot**: a rerun after each upload must not wipe the analyst's work, and an approval of a different amount must not carry over silently. Runner up: decisions frozen per run.
- **Latest findings plus an `audit_runs` log**: the scope asks for a rerun to replace, not duplicate; the log gives "last audited" and totals for logs. Runner up: no runs table.
- **Evidence as a Zod validated JSON column**: findings are write once and always read whole. Runner up: a `finding_evidence` child table.
- **Typed charges and contract rule fields**: surcharge and freight checks become enum comparisons instead of keyword matching. Runner up: free text labels.
- **Suppliers table with a normalized key**: pairs "Inc." variants and supports grouping. Runner up: name text per record.
- **Rejecting overlapping contracts**: keeps "the contract in force on the invoice date" unambiguous. Runner up: latest start date wins.
- **Half up rounding in one helper**: what a client checking one finding by hand expects. Runner up: banker's rounding.
- **Integer ids, whole quantities, USD only, decimal strings from the model**: the smallest choices that keep the math exact and the sample deterministic.

Decided while writing (not asked):
- **Rated charge check in AC-5** (a charge printing a rate must equal that rate of the subtotal): every sample surcharge satisfies it, and it catches a misread rate on the scan. Runner up: check only line, subtotal and total sums.
- **A `now` parameter on every write**: deterministic timestamps in tests without mocking the clock. Runner up: `Date.now()` inside `lib/db`.
- **Brief fixture in `lib/schemas/fixtures/`**: the tests for this feature and Feature 5 need the brief's figures before the generator exists; one copy avoids three. Runner up: fixtures inside each test file.
- **`decide()` supports approve and reject only**: "undo to pending" is not in the brief; Feature 10 can add it.
