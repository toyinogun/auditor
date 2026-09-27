# 0002. Data model for documents, records, findings and decisions

**Date**: 2026-09-27
**Status**: Accepted

## Summary

This spec fixes the shapes every other feature shares: the documents that come in, the invoices, contracts, purchase orders, receipts and payments read from them, the findings the checks produce, and the analyst's decisions. Money is always a whole number of cents and rates are whole basis points (250 means 2.5%), so $9,766.85 can never drift by a rounding error. The LLM only copies numbers as printed text; plain code converts them and rejects any document whose own numbers do not add up. Decisions are tied to a stable finding key, so rerunning the audit keeps the analyst's work.

## Requirements

**User stories**:
- As the checks (Feature 5), I want every invoice, contract, PO, receipt and payment as plain readonly records in integer cents, so that I compute exact money with no parsing or database code.
- As extraction (Feature 7) and the sample generator (Feature 4), I want one Zod shape per document type that doubles as the Claude tool input and the offline JSON copy, so that the LLM path and the offline path produce identical records.
- As an analyst, I want my Approve or Reject to survive a rerun of the audit, and to come back as pending only when the finding's amount has changed.
- As the demo, I want a reset that clears everything, so that each "Load sample data" starts clean.

**Acceptance criteria**:
- **AC-1**: `lib/schemas/` exports Zod shapes for the three extraction types (invoice, contract, purchase order), the two CSV rows (receipt, payment), the domain records, a finding with its evidence, and a decision. Every document in the brief's sample (6 invoices, 2 contracts, 4 POs, both CSVs) parses and converts to records with no special cases.
- **AC-2**: All money is integer cents and all rates are integer basis points. `parseMoney("5.10")` returns `510`, `parseRate("2.5")` returns `250`, and a money string with more than 2 decimals, a thousands separator, a sign or a currency symbol is rejected with a reason naming the field.
- **AC-3**: One rounding helper rounds half away from zero to the cent: `percentOfCents(765000, 250)` returns `19125`, and `percentOfCents(1, 5000)` returns `1`.
- **AC-4**: Quantities are positive whole numbers. A fractional, zero or negative quantity is rejected with a reason naming the line.
- **AC-5**: Converting an invoice extraction to a record fails, with a reason naming the line or field, when any line's quantity × unit price ≠ its printed amount, when the subtotal ≠ the sum of the lines, when a charge that prints a rate ≠ that rate of the subtotal (rounded by AC-3), or when the total ≠ subtotal + charges. All 6 sample invoices pass.
- **AC-6**: A currency other than `USD` on a contract, PO or invoice is rejected with a clear reason.
- **AC-7**: The Drizzle migration creates the 15 tables in *Feature design* with their constraints. Tests apply it to an in memory SQLite database with `foreign_keys` on, and the constraints hold: a duplicate `sha256`, a duplicate `finding_key`, a rejected decision with an empty reason, a negative cents value and a zero quantity are all refused by the database.
- **AC-8**: Saving every sample record and then calling `loadAuditInput()` returns records deep equal to the ones converted from the extractions, to the cent.
- **AC-9**: Supplier names normalize to one key: "Northline Industrial Supply" and "Northline Industrial Supply Inc." resolve to the same supplier row.
- **AC-10**: Saving a contract whose term overlaps an existing contract of the same supplier fails with a reason naming the existing contract number, and stores nothing.
- **AC-11**: Inserting a document whose `sha256` already exists returns the existing document, flagged as already ingested, and adds no row.
- **AC-12**: `saveAuditRun()` writes one `audit_runs` row and replaces all previous findings in one transaction. Calling it twice with the same findings leaves exactly one set.
- **AC-13**: `decide()` stores a decision by `finding_key`. After `saveAuditRun()` runs again, the decision still shows on the same finding. If the finding's `amount_cents` differs from the decision's snapshot, the finding reads as pending. A reject with a blank reason is refused.
- **AC-14**: `resetAll()` empties every table (decisions included) in one transaction.
- **AC-15**: On the sample, the invoiced total derived from the stored invoices is `5393960` cents ($53,939.60, which counts the duplicate NL88310).

## Decision

**Chosen option**: Option 2: A normalized relational model in cents, with extraction shapes kept separate from domain records.

Store each document type in its own relational tables with integer cents, link documents to each other by printed business keys resolved at audit time, and keep three layers of Zod shapes (extraction as printed text, domain records in cents, findings and decisions) with plain mappers between the layers.

**Implementation skills**: `testing-patterns` (user skill, `~/.claude/skills/testing-patterns/`) for the Vitest fixtures and in memory database tests.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

### Three layers of shapes (all in `lib/schemas/`, all readonly)

| Layer | What it is | Money looks like | Used by |
|---|---|---|---|
| Extraction | Claude tool input and the offline JSON copies: `InvoiceExtraction`, `ContractExtraction`, `PurchaseOrderExtraction` | decimal string as printed, `"5.10"` | Features 4, 7 |
| CSV rows | One row of `receipts.csv` or `ap_payments.csv`: `ReceiptCsvRow`, `PaymentCsvRow` | decimal string | Features 4, 8 |
| Records | What the checks read: `InvoiceRecord`, `ContractRecord`, `PurchaseOrderRecord`, `ReceiptRecord`, `PaymentRecord`, bundled as `AuditInput` | integer cents | Features 5, 6 |
| Findings | `Finding`, `EvidenceItem`, `DecisionInput` | integer cents | Features 5, 10, 11 |

Pure converters (`toInvoiceRecord`, `toContractRecord`, `toPurchaseOrderRecord`, `toReceiptRecord`, `toPaymentRecord`) turn extraction or CSV shapes into records. Each returns `{ ok: true, value } | { ok: false, error }`, and runs the money, quantity, currency and arithmetic rules. Records carry their `documentId` and locators (clause, `lineNo`, `rowNo`) so the checks can build evidence without the database.

**Extraction field lists** (camelCase in Zod, snake_case in SQL):
- Invoice: `invoiceNumber`, `supplierName`, `invoiceDate`, `poNumber` (nullable), `currency`, `lines[]` {`sku`, `description`, `quantity`, `unitPrice`, `amount`}, `charges[]` {`kind`, `surchargeType` (required when kind is `surcharge`, else null), `label`, `rate` (nullable, percent as a string such as `"2.5"`), `amount`}, `subtotal`, `total`.
- Contract: `contractNumber`, `supplierName`, `startDate`, `endDate`, `currency`, `prices[]` {`sku`, `description`, `unitPrice`, `clause`}, `freightTerms`, `freightClause` (nullable), `surchargeClause` (nullable), `surcharges[]` {`surchargeType`, `capRate` (nullable), `clause`}.
- Purchase order: `poNumber`, `supplierName`, `orderDate`, `currency`, `lines[]` {`sku`, `description`, `quantity`, `unitPrice` (nullable)}.
- Receipt CSV columns: `po_number`, `sku`, `quantity_received`, `received_date`.
- Payment CSV columns: `invoice_number`, `supplier`, `amount`, `paid_date`, `reference`.

**Record field lists** (all readonly; every record also carries `documentId` and `filename`, and supplier bearing records carry `supplierKey` and `supplierName`):
- `InvoiceRecord`: `invoiceNumber` (as printed), `invoiceDate`, `poNumber` (nullable), `currency`, `subtotalCents`, `totalCents`, `lines[]` {`lineNo`, `sku`, `description`, `quantity`, `unitPriceCents`, `amountCents`}, `charges[]` {`lineNo`, `kind`, `surchargeType` (nullable), `label`, `rateBps` (nullable), `amountCents`}.
- `ContractRecord`: `contractNumber`, `startDate`, `endDate`, `currency`, `freightTerms`, `freightClause` (nullable), `surchargeClause` (nullable), `prices[]` {`sku`, `description`, `unitPriceCents`, `clause`}, `surcharges[]` {`surchargeType`, `capBps` (nullable), `clause`}.
- `PurchaseOrderRecord`: `poNumber`, `orderDate`, `currency`, `lines[]` {`lineNo`, `sku`, `description`, `quantity`, `unitPriceCents` (nullable, for display only, never used by a check)}.
- `ReceiptRecord`: `rowNo`, `poNumber`, `sku`, `quantityReceived`, `receivedDate` (no supplier).
- `PaymentRecord`: `rowNo`, `invoiceNumber` (as printed), `amountCents`, `paidDate`, `reference` (nullable).
- `AuditInput`: `{ invoices, contracts, purchaseOrders, receipts, payments }`, each a readonly array of the records above.

**Shared enums** (one Zod enum each, used by extraction, records and the Drizzle columns alike): `SurchargeType` (`fuel`/`energy`/`other`) for both invoice charges and contract surcharges, `ChargeKind`, `FreightTerms`, `DocumentKind`, `DocumentStatus`, `DocumentSource`, `CheckId`, `FindingAction`, `DecisionStatus`.

A contract term includes both its `startDate` and its `endDate`: a contract is in force on date `d` when `startDate <= d <= endDate` (plain string comparison works on `YYYY-MM-DD`).

Money strings match `^\d{1,9}(\.\d{1,2})?$`. Rate strings match `^\d{1,3}(\.\d{1,2})?$` (percent, converted exactly to basis points). Dates match `YYYY-MM-DD` and must be real calendar dates.

### Data model sketch

Every `id` is an `integer` primary key, auto increment. `_cents`, `_bps`, `quantity*` are integers with `CHECK (>= 0)` (quantities `> 0`). Dates are `YYYY-MM-DD` text. Timestamps (`*_at`) are integer ms since epoch. All foreign keys to `documents` and to parent records cascade on delete.

| Table | Columns (null = nullable, else required) | Keys and constraints |
|---|---|---|
| `documents` | `sha256`, `filename`, `mime_type`, `size_bytes`, `source` (`upload`/`webhook`/`sample`), `kind` null (`invoice`/`contract`/`purchase_order`/`receipts_csv`/`payments_csv`), `status` (`queued`/`extracting`/`done`/`failed`), `error` null, `has_text_layer` null (boolean), `created_at`, `updated_at` | `sha256` unique |
| `suppliers` | `key`, `name` (first name seen) | `key` unique |
| `contracts` | `document_id`, `supplier_id`, `contract_number`, `start_date`, `end_date`, `currency`, `freight_terms` (`included`/`billable`/`not_stated`), `freight_clause` null, `surcharge_clause` null | `document_id` unique; `CHECK (start_date <= end_date)`; index (`supplier_id`, `start_date`) |
| `contract_prices` | `contract_id`, `sku`, `description`, `unit_price_cents`, `clause` | unique (`contract_id`, `sku`) |
| `contract_surcharges` | `contract_id`, `surcharge_type` (`fuel`/`energy`/`other`), `cap_bps` null (null = no cap), `clause` | unique (`contract_id`, `surcharge_type`); no rows = no surcharge permitted |
| `purchase_orders` | `document_id`, `supplier_id`, `po_number`, `order_date`, `currency` | `document_id` unique; index `po_number` |
| `po_lines` | `po_id`, `line_no`, `sku`, `description`, `quantity`, `unit_price_cents` null | unique (`po_id`, `line_no`) |
| `invoices` | `document_id`, `supplier_id`, `invoice_number` (as printed), `invoice_date`, `po_number` null, `currency`, `subtotal_cents`, `total_cents` | `document_id` unique; index `invoice_number`, index `po_number`; `invoice_number` is NOT unique (duplicates are what the check looks for) |
| `invoice_lines` | `invoice_id`, `line_no`, `sku`, `description`, `quantity`, `unit_price_cents`, `amount_cents` | unique (`invoice_id`, `line_no`) |
| `invoice_charges` | `invoice_id`, `line_no`, `kind` (`surcharge`/`freight`/`other`), `surcharge_type` null, `label`, `rate_bps` null, `amount_cents` | unique (`invoice_id`, `line_no`); `CHECK ((kind = 'surcharge') = (surcharge_type IS NOT NULL))` |
| `receipts` | `document_id`, `row_no`, `po_number`, `sku`, `quantity_received`, `received_date` | unique (`document_id`, `row_no`); index (`po_number`, `sku`) |
| `payments` | `document_id`, `row_no`, `supplier_id`, `invoice_number`, `amount_cents`, `paid_date`, `reference` null | unique (`document_id`, `row_no`); index `invoice_number` |
| `audit_runs` | `started_at`, `finished_at`, `invoice_count`, `invoiced_total_cents`, `recoverable_total_cents`, `finding_count` | |
| `findings` | `run_id`, `finding_key`, `check_id` (`contract_price`/`duplicate`/`quantity_received`/`surcharge`/`freight`/`missing_reference`), `action` (`recover`/`block_payment`/`review_only`), `invoice_id`, `amount_cents`, `title`, `calculation`, `evidence` (JSON text) | `finding_key` unique; FK `run_id` and `invoice_id` cascade |
| `decisions` | `finding_key`, `status` (`approved`/`rejected`), `reason` null, `amount_cents`, `decided_at` | `finding_key` primary key, deliberately no FK (it must outlive a rerun); `CHECK (status = 'approved' OR (reason IS NOT NULL AND length(trim(reason)) > 0))` (the explicit `IS NOT NULL` matters: SQLite passes a `CHECK` that evaluates to NULL) |

**Relationships**: `documents` 1:1 `contracts`/`purchase_orders`/`invoices`, 1:N `receipts`/`payments` (one CSV, many rows). `suppliers` 1:N `contracts`, `purchase_orders`, `invoices`, `payments`. Each parent 1:N its lines, prices, surcharges or charges. `audit_runs` 1:N `findings`. Text links resolved in the checks, not the database: `invoices.po_number` → `purchase_orders.po_number`, `receipts.po_number` → `purchase_orders.po_number`, `payments.invoice_number` → `invoices.invoice_number`, `decisions.finding_key` → `findings.finding_key`.

**Evidence item** (Zod, stored as a JSON array; the `Finding` schema enforces `evidence: z.array(EvidenceItem).min(1)`, because SQLite cannot check a JSON array's length): `{ label: string, value: string, source: { documentId: number, filename: string, locator: string } }`. Example: `{ label: "Contract price", value: "$4.85", source: { documentId: 3, filename: "C-2026-014.pdf", locator: "Schedule A, item 1" } }`.

**Finding key**: `findingKey({ check, supplierKey, invoiceNumber, detail })` builds `<check>:<supplierKey>:<invoiceNumber as printed>:<detail>`, where `detail` is the SKU, the charge (`freight`, `surcharge-fuel`, `surcharge-energy`, or `charge-line-N` for an unrecognized charge), a missing reference (`po`, `contract`, `receipt`), or `-`. Example: `contract_price:northline industrial supply:NL-88310:NL-BRG-6204`. Feature 5 calls it; this spec owns the format.

**Invoice number match key**: `normalizeInvoiceNumber(number)` uppercases and drops every character that is not a letter or digit, so `NL-88310` and `NL88310` both become `NL88310`. The duplicate check (Feature 5) matches on it. Finding keys and stored columns keep the number as printed.

**Supplier key**: `normalizeSupplierKey(name)` lowercases, replaces punctuation with spaces, drops trailing legal suffixes (`inc`, `incorporated`, `co`, `company`, `corp`, `corporation`, `llc`, `ltd`, `limited`), and collapses whitespace.

### State transitions

- Document: `queued` → `extracting` → `done` | `failed`. A CSV goes `queued` → `done` | `failed` (parsed, no model). Records are inserted and `status` set to `done` in the same transaction, so a document is never `done` without its records. The retry from `failed` or a stuck `extracting` belongs to Feature 8.
- Decision: pending (no row) → `approved` | `rejected`. An analyst may switch between `approved` and `rejected` (`decide()` upserts). A finding whose `amount_cents` differs from the decision's snapshot reads as pending until decided again.

### API surface (module functions; no HTTP in this feature)

| Function | Module | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `parseMoney`, `parseRate`, `percentOfCents`, `formatCents` | `lib/schemas/money.ts` | string, or cents and bps | cents, bps, `"$1,234.56"` | none (pure) | invalid format |
| `normalizeSupplierKey`, `normalizeInvoiceNumber`, `findingKey` | `lib/schemas/keys.ts` | name, or key parts | string | none (pure) | none |
| `toInvoiceRecord`, `toContractRecord`, `toPurchaseOrderRecord`, `toReceiptRecord`, `toPaymentRecord` | `lib/schemas/convert.ts` | extraction or CSV row, `documentId`, `rowNo` for CSV | `Result<Record>` | none (pure) | shape, money, quantity, currency, arithmetic |
| `openDb(path)` | `lib/db/client.ts` | file path or `:memory:` | Drizzle db, WAL and `foreign_keys` on, migrations applied | server only | migration failure throws (a bug) |
| `insertDocument(db, doc, now)` | `lib/db/documents.ts` | sha256, filename, mime, size, source | `{ document, alreadyIngested }` | server only | none (dedupe is a success) |
| `setDocumentStatus(db, id, status, error?, now)` | `lib/db/documents.ts` | id, status | void | server only | unknown id |
| `saveInvoice`, `saveContract`, `savePurchaseOrder` | `lib/db/records.ts` | db, record, `supplierName`, `now` | `Result<id>`; upserts supplier; marks document `done` | server only | contract overlap (AC-10) |
| `saveReceipts`, `savePayments` | `lib/db/records.ts` | db, `documentId`, records[] | `Result<count>`; marks document `done` | server only | FK violation |
| `loadAuditInput(db)` | `lib/db/records.ts` | db | `AuditInput` (records in cents, with supplier key and name) | server only | none |
| `saveAuditRun(db, run, findings)` | `lib/db/audit.ts` | run timestamps, `Finding[]` | run id; replaces findings in one transaction | server only | none |
| `listFindings(db)` | `lib/db/audit.ts` | db | findings with `decision` (`pending`/`approved`/`rejected`, reason), largest amount first | server only | invalid stored evidence throws (a bug) |
| `decide(db, input, now)` | `lib/db/audit.ts` | `finding_key`, status, reason | `Result<Decision>` | server only | unknown key, blank reject reason |
| `resetAll(db)` | `lib/db/admin.ts` | db | void | server only | none |

### Value sourcing

| Action | Value | Source |
|---|---|---|
| `to*Record` | cents | `parseMoney` of the printed string |
| `to*Record` | basis points | `parseRate` of the printed percent string |
| `toInvoiceRecord` | `lineNo` on lines and charges | position in the extraction array, starting at 1 |
| `to*Record` (CSV) | `rowNo` | data row index in the CSV, starting at 1, header excluded; passed in by the caller (Feature 6/8) |
| `save*` | `supplier_id` | upsert by `normalizeSupplierKey(supplierName)`; for payments, the `supplier` CSV column |
| `insertDocument` | `source` | the caller: upload action, webhook route, or sample loader |
| `insertDocument` | `sha256`, `size_bytes`, `mime_type` | computed by the caller from the file bytes (Feature 8), or the sample loader |
| `setDocumentStatus` | `has_text_layer` | Feature 7 (unpdf text check); null for CSVs and offline loads |
| every write | `*_at` | the `now` parameter (ms), defaulted to `Date.now()` at the edge, so tests are deterministic |
| `saveAuditRun` | `invoiced_total_cents`, `invoice_count` | sum and count of `invoices.total_cents` across all invoices, duplicates included |
| `saveAuditRun` | `recoverable_total_cents`, `finding_count` | sum of the findings passed in with action `recover` (spec 0004, AC-6), and the count of all of them |
| finding | `amount_cents`, `title`, `calculation`, `evidence` | the check functions (Feature 5), built from records only |
| evidence | `filename` | `documents.filename`, carried on each record by `loadAuditInput` |
| evidence | `locator` | the record's `clause` (contract prices, surcharges, freight), `"line N"` from `lineNo` (invoice lines, PO lines), `"charge line N"` from a charge's `lineNo` (invoice charges, spec 0004), `"row N"` from `rowNo` (CSVs); for invoice level facts a fixed label: `"Invoice number"`, `"Invoice date"`, `"Subtotal"`, `"Invoice total"`, `"PO number"` |
| duplicate check | invoice match key | `normalizeInvoiceNumber(invoiceNumber)` |
| `listFindings` | decision state | `decisions` row by `finding_key`; pending when no row or `decisions.amount_cents ≠ findings.amount_cents` |
| contract `clause`, `freightClause`, `surchargeClause` | clause text | printed on the contract PDF (Feature 4 must print them), extracted by Feature 7 |

### Key invariants

- Money is never a float. Only `parseMoney`/`parseRate` read money text, and only `percentOfCents` rounds.
- Invoice arithmetic holds for every stored invoice (AC-5): line = quantity × unit price, subtotal = sum of lines, rated charge = rate of subtotal, total = subtotal + charges.
- At most one contract per supplier covers any date.
- A `done` document has exactly its records, written in the same transaction.
- A rejected decision always has a non blank reason (Zod and a DB `CHECK`).
- Only the latest audit run has findings; `finding_key` is unique within it.
- `PRAGMA foreign_keys = ON` is set on every connection (SQLite leaves it off by default).
- `lib/schemas/` stays pure (Zod only). Only `lib/db/` imports Drizzle or better-sqlite3.

### Security model

No accounts in v1 (spec 0001). Every function here is server only: `lib/db/` must never be imported from a client component (add `import "server-only"` to its entry files). Documents are fictional sample data; nothing in the model is regulated. Never log extracted field values; log ids, counts and status only.

### Configuration required

- `DATA_DIR`: folder that holds `auditor.db` (default `./data`, `/data` on k3s). Created here in `lib/env.ts` if it does not exist yet; other variables from spec 0001 are added by the features that use them.

### Critical test scenarios

- Happy path: every brief sample document converts, saves, and loads back deep equal, with an invoiced total of `5393960` cents, verifies **AC-1**, **AC-8**, **AC-15**.
- Arithmetic guard: change NL-88310's unit price to `"5.01"` and the conversion fails naming line 1, verifies **AC-5**.
- Money parsing: `"5.1"` → 510, `"5.105"`, `"1,500.00"`, `"-3.00"`, `"$5.10"` rejected; `percentOfCents(765000, 250)` → 19125, verifies **AC-2**, **AC-3**.
- Rerun keeps decisions: approve a finding, rerun `saveAuditRun` with the same findings, and it is still approved; rerun with its amount changed, and it reads pending, verifies **AC-12**, **AC-13**.
- Constraints: duplicate `sha256` returns the existing row; an overlapping contract is refused naming C-2026-014; a blank reject reason is refused by both Zod and the DB, verifies **AC-7**, **AC-10**, **AC-11**.
- Auth/permission: not applicable in v1 (no accounts); `lib/db/` imports `server-only`, so a client import fails the build.

## Build plan

Skateboard: pure shapes first (they are usable by Features 4 and 5 on their own), then the database underneath them, each step shippable with its tests.

1. Install `zod`, `drizzle-orm`, `better-sqlite3`, and dev `drizzle-kit`, `@types/better-sqlite3`; confirm `better-sqlite3` is in `serverExternalPackages` in `next.config.ts`, satisfies **AC-7**.
2. `lib/schemas/money.ts` with tests: `parseMoney`, `parseRate`, `percentOfCents` (half away from zero), `formatCents`, satisfies **AC-2**, **AC-3**.
3. `lib/schemas/` extraction, CSV and record shapes, plus `lib/schemas/fixtures/brief-sample.ts` holding the brief's 12 documents and both CSVs as extraction and CSV shapes, satisfies **AC-1**.
4. `lib/schemas/convert.ts` with tests: the `to*Record` converters with quantity, currency and invoice arithmetic rules, run against every fixture plus broken copies, satisfies **AC-1**, **AC-4**, **AC-5**, **AC-6**.
5. `lib/schemas/keys.ts` and `lib/schemas/finding.ts` with tests: `normalizeSupplierKey`, `normalizeInvoiceNumber` (`NL-88310` and `NL88310` match), `findingKey`, the `Finding`, `EvidenceItem` and `DecisionInput` shapes, satisfies **AC-9**, **AC-13**.
6. `lib/env.ts` (`DATA_DIR`), `lib/db/schema.ts` (the 15 tables), `drizzle.config.ts`, the first generated migration in `drizzle/`, `lib/db/client.ts` (`openDb` with WAL, `foreign_keys`, `migrate()`), and `instrumentation.ts` calling it on the Node runtime; constraint tests on `:memory:`, satisfies **AC-7**.
7. `lib/db/documents.ts` and `lib/db/records.ts` with tests: dedupe on `sha256`, supplier upsert, contract overlap guard, save and `loadAuditInput` round trip on the full fixture, satisfies **AC-8**, **AC-9**, **AC-10**, **AC-11**, **AC-15**.
8. `lib/db/audit.ts` and `lib/db/admin.ts` with tests: `saveAuditRun` replace in a transaction, `listFindings` with decision state, `decide`, `resetAll`, satisfies **AC-12**, **AC-13**, **AC-14**.

## Consequences

**Positive**:
- Exact money end to end; the $9,766.85 test can only fail on logic, never on floats.
- The offline path and the LLM path share one converter, so offline mode and a real run cannot disagree on shape (Feature 7's "matches offline mode" test).
- The arithmetic guard catches a misread digit on the scanned invoice at ingest, with a reason the review screen can show.
- The checks get plain readonly records and need no database, keeping `lib/checks/` pure.

**Negative / tradeoffs**:
- Sub cent unit prices, fractional quantities, credit notes (negative amounts) and non USD documents are rejected. Real clients will have some; each is a rule change and a migration later.
- 15 tables and three shape layers is more code than one JSON blob per document; the mappers must be kept in step with both sides.
- Text links (PO and invoice numbers) mean the database cannot stop a dangling reference; the checks must treat "not found" as a normal state.
- The rate check in AC-5 assumes a percentage charge is computed on the goods subtotal. An invoice that computes it on another base fails ingest and needs a rule change.
- Decisions without a foreign key can orphan (a finding that never comes back leaves its decision behind). Harmless, and `resetAll` clears them.

**Neutral**:
- The first real migration lands with this feature; every later schema change is a new generated migration.
- Supplier normalization is deliberately simple; a fuzzy match is a later concern if real data needs it.

## Follow-up

- [ ] Feature 4 (sample generator): print clause references on both contracts (price schedule items, freight clause, surcharge clause), write the CSV columns named here, and consider importing `lib/schemas/fixtures/brief-sample.ts` as its single source of figures.
- [ ] Feature 5 (six checks): consume `AuditInput`, build keys with `findingKey`, match duplicates with `normalizeInvoiceNumber`, and produce `Finding` objects. Two rules live there: not counting the duplicate's own price and freight issues, and what to report when no contract covers an invoice's date (distinct from a SKU with no contract price).
- [ ] Feature 7 (extraction): generate the tool input schemas from the extraction shapes with `z.toJSONSchema()` and smoke test one real call (spec 0001).
- [ ] Feature 8 (ingest): compute `sha256`, size and mime; map a converter error to `documents.error` with status `failed`.
- [ ] Feature 10 (review screen): decide whether "undo to pending" is needed; `decide()` supports approve and reject only.
