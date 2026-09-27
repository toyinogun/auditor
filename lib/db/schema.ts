import { sql, type SQL } from "drizzle-orm";
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
  type AnySQLiteColumn,
} from "drizzle-orm/sqlite-core";
import {
  ChargeKind,
  CheckId,
  CURRENCY,
  DecisionStatus,
  DocumentKind,
  DocumentSource,
  DocumentStatus,
  FindingAction,
  FreightTerms,
  SurchargeType,
} from "../schemas/enums";

/**
 * The 15 tables of spec 0002. Money is integer cents, rates integer basis points, dates
 * YYYY-MM-DD text, timestamps integer ms. Links by printed business key (PO number, invoice
 * number, finding key) are text, resolved by the checks, not by foreign keys.
 */

const id = () => integer("id").primaryKey({ autoIncrement: true });
const timestamp = (name: string) => integer(name).notNull();
const date = (name: string) => text(name).notNull();
const currency = () => text("currency").notNull();

/** Drizzle wants a non empty tuple; a Zod enum always has at least one option. */
const oneOf = <T extends string>(values: readonly T[]) =>
  values as readonly [T, ...T[]];

const inList = (column: AnySQLiteColumn, values: readonly string[]): SQL =>
  sql`${column} IN (${sql.raw(values.map((value) => `'${value}'`).join(", "))})`;

const cascade = { onDelete: "cascade" } as const;

export const documents = sqliteTable(
  "documents",
  {
    id: id(),
    sha256: text("sha256").notNull(),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    source: text("source", { enum: oneOf(DocumentSource.options) }).notNull(),
    kind: text("kind", { enum: oneOf(DocumentKind.options) }),
    status: text("status", { enum: oneOf(DocumentStatus.options) }).notNull(),
    error: text("error"),
    hasTextLayer: integer("has_text_layer", { mode: "boolean" }),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
  },
  (t) => [
    uniqueIndex("documents_sha256_unique").on(t.sha256),
    check("documents_size_bytes_check", sql`${t.sizeBytes} >= 0`),
    check("documents_source_check", inList(t.source, DocumentSource.options)),
    check(
      "documents_kind_check",
      sql`${t.kind} IS NULL OR ${inList(t.kind, DocumentKind.options)}`,
    ),
    check("documents_status_check", inList(t.status, DocumentStatus.options)),
  ],
);

export const suppliers = sqliteTable(
  "suppliers",
  {
    id: id(),
    key: text("key").notNull(),
    name: text("name").notNull(),
  },
  (t) => [uniqueIndex("suppliers_key_unique").on(t.key)],
);

export const contracts = sqliteTable(
  "contracts",
  {
    id: id(),
    documentId: integer("document_id")
      .notNull()
      .references(() => documents.id, cascade),
    supplierId: integer("supplier_id")
      .notNull()
      .references(() => suppliers.id),
    contractNumber: text("contract_number").notNull(),
    startDate: date("start_date"),
    endDate: date("end_date"),
    currency: currency(),
    freightTerms: text("freight_terms", {
      enum: oneOf(FreightTerms.options),
    }).notNull(),
    freightClause: text("freight_clause"),
    surchargeClause: text("surcharge_clause"),
  },
  (t) => [
    uniqueIndex("contracts_document_id_unique").on(t.documentId),
    index("contracts_supplier_start_idx").on(t.supplierId, t.startDate),
    check("contracts_term_check", sql`${t.startDate} <= ${t.endDate}`),
    check(
      "contracts_currency_check",
      sql`${t.currency} = ${sql.raw(`'${CURRENCY}'`)}`,
    ),
    check(
      "contracts_freight_terms_check",
      inList(t.freightTerms, FreightTerms.options),
    ),
  ],
);

export const contractPrices = sqliteTable(
  "contract_prices",
  {
    id: id(),
    contractId: integer("contract_id")
      .notNull()
      .references(() => contracts.id, cascade),
    sku: text("sku").notNull(),
    description: text("description").notNull(),
    unitPriceCents: integer("unit_price_cents").notNull(),
    clause: text("clause").notNull(),
  },
  (t) => [
    uniqueIndex("contract_prices_contract_sku_unique").on(t.contractId, t.sku),
    check("contract_prices_unit_price_check", sql`${t.unitPriceCents} >= 0`),
  ],
);

export const contractSurcharges = sqliteTable(
  "contract_surcharges",
  {
    id: id(),
    contractId: integer("contract_id")
      .notNull()
      .references(() => contracts.id, cascade),
    surchargeType: text("surcharge_type", {
      enum: oneOf(SurchargeType.options),
    }).notNull(),
    /** Null means no cap. No rows for a contract means no surcharge is permitted. */
    capBps: integer("cap_bps"),
    clause: text("clause").notNull(),
  },
  (t) => [
    uniqueIndex("contract_surcharges_contract_type_unique").on(
      t.contractId,
      t.surchargeType,
    ),
    check(
      "contract_surcharges_cap_check",
      sql`${t.capBps} IS NULL OR ${t.capBps} >= 0`,
    ),
    check(
      "contract_surcharges_type_check",
      inList(t.surchargeType, SurchargeType.options),
    ),
  ],
);

export const purchaseOrders = sqliteTable(
  "purchase_orders",
  {
    id: id(),
    documentId: integer("document_id")
      .notNull()
      .references(() => documents.id, cascade),
    supplierId: integer("supplier_id")
      .notNull()
      .references(() => suppliers.id),
    poNumber: text("po_number").notNull(),
    orderDate: date("order_date"),
    currency: currency(),
  },
  (t) => [
    uniqueIndex("purchase_orders_document_id_unique").on(t.documentId),
    index("purchase_orders_po_number_idx").on(t.poNumber),
    check(
      "purchase_orders_currency_check",
      sql`${t.currency} = ${sql.raw(`'${CURRENCY}'`)}`,
    ),
  ],
);

export const poLines = sqliteTable(
  "po_lines",
  {
    id: id(),
    poId: integer("po_id")
      .notNull()
      .references(() => purchaseOrders.id, cascade),
    lineNo: integer("line_no").notNull(),
    sku: text("sku").notNull(),
    description: text("description").notNull(),
    quantity: integer("quantity").notNull(),
    unitPriceCents: integer("unit_price_cents"),
  },
  (t) => [
    uniqueIndex("po_lines_po_line_unique").on(t.poId, t.lineNo),
    check("po_lines_quantity_check", sql`${t.quantity} > 0`),
    check(
      "po_lines_unit_price_check",
      sql`${t.unitPriceCents} IS NULL OR ${t.unitPriceCents} >= 0`,
    ),
  ],
);

export const invoices = sqliteTable(
  "invoices",
  {
    id: id(),
    documentId: integer("document_id")
      .notNull()
      .references(() => documents.id, cascade),
    supplierId: integer("supplier_id")
      .notNull()
      .references(() => suppliers.id),
    /** As printed. Not unique: duplicates are what the duplicate check looks for. */
    invoiceNumber: text("invoice_number").notNull(),
    invoiceDate: date("invoice_date"),
    poNumber: text("po_number"),
    currency: currency(),
    subtotalCents: integer("subtotal_cents").notNull(),
    totalCents: integer("total_cents").notNull(),
  },
  (t) => [
    uniqueIndex("invoices_document_id_unique").on(t.documentId),
    index("invoices_invoice_number_idx").on(t.invoiceNumber),
    index("invoices_po_number_idx").on(t.poNumber),
    check(
      "invoices_currency_check",
      sql`${t.currency} = ${sql.raw(`'${CURRENCY}'`)}`,
    ),
    check("invoices_subtotal_check", sql`${t.subtotalCents} >= 0`),
    check("invoices_total_check", sql`${t.totalCents} >= 0`),
  ],
);

export const invoiceLines = sqliteTable(
  "invoice_lines",
  {
    id: id(),
    invoiceId: integer("invoice_id")
      .notNull()
      .references(() => invoices.id, cascade),
    lineNo: integer("line_no").notNull(),
    sku: text("sku").notNull(),
    description: text("description").notNull(),
    quantity: integer("quantity").notNull(),
    unitPriceCents: integer("unit_price_cents").notNull(),
    amountCents: integer("amount_cents").notNull(),
  },
  (t) => [
    uniqueIndex("invoice_lines_invoice_line_unique").on(t.invoiceId, t.lineNo),
    check("invoice_lines_quantity_check", sql`${t.quantity} > 0`),
    check("invoice_lines_unit_price_check", sql`${t.unitPriceCents} >= 0`),
    check("invoice_lines_amount_check", sql`${t.amountCents} >= 0`),
  ],
);

export const invoiceCharges = sqliteTable(
  "invoice_charges",
  {
    id: id(),
    invoiceId: integer("invoice_id")
      .notNull()
      .references(() => invoices.id, cascade),
    lineNo: integer("line_no").notNull(),
    kind: text("kind", { enum: oneOf(ChargeKind.options) }).notNull(),
    surchargeType: text("surcharge_type", {
      enum: oneOf(SurchargeType.options),
    }),
    label: text("label").notNull(),
    rateBps: integer("rate_bps"),
    amountCents: integer("amount_cents").notNull(),
  },
  (t) => [
    uniqueIndex("invoice_charges_invoice_line_unique").on(
      t.invoiceId,
      t.lineNo,
    ),
    check("invoice_charges_kind_check", inList(t.kind, ChargeKind.options)),
    check(
      "invoice_charges_surcharge_type_check",
      sql`(${t.kind} = 'surcharge') = (${t.surchargeType} IS NOT NULL)`,
    ),
    check(
      "invoice_charges_rate_check",
      sql`${t.rateBps} IS NULL OR ${t.rateBps} >= 0`,
    ),
    check("invoice_charges_amount_check", sql`${t.amountCents} >= 0`),
  ],
);

export const receipts = sqliteTable(
  "receipts",
  {
    id: id(),
    documentId: integer("document_id")
      .notNull()
      .references(() => documents.id, cascade),
    rowNo: integer("row_no").notNull(),
    poNumber: text("po_number").notNull(),
    sku: text("sku").notNull(),
    quantityReceived: integer("quantity_received").notNull(),
    receivedDate: date("received_date"),
  },
  (t) => [
    uniqueIndex("receipts_document_row_unique").on(t.documentId, t.rowNo),
    index("receipts_po_sku_idx").on(t.poNumber, t.sku),
    check("receipts_quantity_check", sql`${t.quantityReceived} > 0`),
  ],
);

export const payments = sqliteTable(
  "payments",
  {
    id: id(),
    documentId: integer("document_id")
      .notNull()
      .references(() => documents.id, cascade),
    rowNo: integer("row_no").notNull(),
    supplierId: integer("supplier_id")
      .notNull()
      .references(() => suppliers.id),
    invoiceNumber: text("invoice_number").notNull(),
    amountCents: integer("amount_cents").notNull(),
    paidDate: date("paid_date"),
    reference: text("reference"),
  },
  (t) => [
    uniqueIndex("payments_document_row_unique").on(t.documentId, t.rowNo),
    index("payments_invoice_number_idx").on(t.invoiceNumber),
    check("payments_amount_check", sql`${t.amountCents} >= 0`),
  ],
);

export const auditRuns = sqliteTable(
  "audit_runs",
  {
    id: id(),
    startedAt: timestamp("started_at"),
    finishedAt: timestamp("finished_at"),
    invoiceCount: integer("invoice_count").notNull(),
    invoicedTotalCents: integer("invoiced_total_cents").notNull(),
    recoverableTotalCents: integer("recoverable_total_cents").notNull(),
    findingCount: integer("finding_count").notNull(),
  },
  (t) => [
    check("audit_runs_invoiced_total_check", sql`${t.invoicedTotalCents} >= 0`),
    check(
      "audit_runs_recoverable_total_check",
      sql`${t.recoverableTotalCents} >= 0`,
    ),
  ],
);

export const findings = sqliteTable(
  "findings",
  {
    id: id(),
    runId: integer("run_id")
      .notNull()
      .references(() => auditRuns.id, cascade),
    findingKey: text("finding_key").notNull(),
    checkId: text("check_id", { enum: oneOf(CheckId.options) }).notNull(),
    action: text("action", { enum: oneOf(FindingAction.options) }).notNull(),
    invoiceId: integer("invoice_id")
      .notNull()
      .references(() => invoices.id, cascade),
    amountCents: integer("amount_cents").notNull(),
    title: text("title").notNull(),
    calculation: text("calculation").notNull(),
    /** JSON array of `EvidenceItem`; the `Finding` schema enforces at least one. */
    evidence: text("evidence").notNull(),
  },
  (t) => [
    uniqueIndex("findings_finding_key_unique").on(t.findingKey),
    check("findings_check_id_check", inList(t.checkId, CheckId.options)),
    check("findings_action_check", inList(t.action, FindingAction.options)),
    check("findings_amount_check", sql`${t.amountCents} >= 0`),
  ],
);

/** Keyed by finding key with no foreign key, so a decision outlives a rerun of the audit. */
export const decisions = sqliteTable(
  "decisions",
  {
    findingKey: text("finding_key").primaryKey(),
    status: text("status", { enum: oneOf(DecisionStatus.options) }).notNull(),
    reason: text("reason"),
    /** The finding amount the analyst decided on; a different amount reads as pending. */
    amountCents: integer("amount_cents").notNull(),
    decidedAt: timestamp("decided_at"),
  },
  (t) => [
    check("decisions_status_check", inList(t.status, DecisionStatus.options)),
    // The explicit IS NOT NULL matters: SQLite passes a CHECK that evaluates to NULL.
    check(
      "decisions_reason_check",
      sql`${t.status} = 'approved' OR (${t.reason} IS NOT NULL AND length(trim(${t.reason})) > 0)`,
    ),
    check("decisions_amount_check", sql`${t.amountCents} >= 0`),
  ],
);
