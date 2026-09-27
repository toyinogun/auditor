import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "./client";
import {
  auditRuns,
  decisions,
  documents,
  findings,
  invoiceLines,
  invoices,
  suppliers,
} from "./schema";

const TABLES = [
  "audit_runs",
  "contract_prices",
  "contract_surcharges",
  "contracts",
  "decisions",
  "documents",
  "findings",
  "invoice_charges",
  "invoice_lines",
  "invoices",
  "payments",
  "po_lines",
  "purchase_orders",
  "receipts",
  "suppliers",
];

const NOW = 1_790_000_000_000;

const document = (sha256: string) => ({
  sha256,
  filename: `${sha256}.pdf`,
  mimeType: "application/pdf",
  sizeBytes: 1024,
  source: "sample" as const,
  kind: "invoice" as const,
  status: "done" as const,
  createdAt: NOW,
  updatedAt: NOW,
});

/** A stored invoice to hang lines and findings on. */
const seedInvoice = (db: Db) => {
  const doc = db.insert(documents).values(document("a1")).returning().get();
  const supplier = db
    .insert(suppliers)
    .values({ key: "northline", name: "Northline" })
    .returning()
    .get();
  return db
    .insert(invoices)
    .values({
      documentId: doc.id,
      supplierId: supplier.id,
      invoiceNumber: "NL-88310",
      invoiceDate: "2026-04-03",
      poNumber: "PO-4504",
      currency: "USD",
      subtotalCents: 765000,
      totalCents: 814100,
    })
    .returning()
    .get();
};

const line = (
  invoiceId: number,
  lineNo: number,
  quantity: number,
  amountCents = 100,
) => ({
  invoiceId,
  lineNo,
  sku: "NL-BRG-6204",
  description: "Bearing",
  quantity,
  unitPriceCents: 100,
  amountCents,
});

const finding = (runId: number, invoiceId: number, findingKey: string) => ({
  runId,
  findingKey,
  checkId: "freight" as const,
  action: "recover" as const,
  invoiceId,
  amountCents: 18500,
  title: "Freight billed",
  calculation: "$185.00",
  evidence: "[]",
});

describe("openDb", () => {
  let db: Db;
  beforeEach(() => {
    db = openDb(":memory:");
  });

  it("applies the migration: exactly the 15 spec tables", () => {
    const rows = db.all<{ name: string }>(
      sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%' ORDER BY name`,
    );
    expect(rows.map((row) => row.name)).toEqual(TABLES);
  });

  it("turns foreign keys on", () => {
    expect(db.$client.pragma("foreign_keys", { simple: true })).toBe(1);
  });

  it("is safe to open twice on the same file (migrations are idempotent)", () => {
    expect(() => openDb(":memory:")).not.toThrow();
  });

  it("refuses a duplicate sha256", () => {
    db.insert(documents).values(document("same")).run();
    expect(() => db.insert(documents).values(document("same")).run()).toThrow(
      /UNIQUE/,
    );
  });

  it("refuses a duplicate finding key", () => {
    const invoice = seedInvoice(db);
    const run = db
      .insert(auditRuns)
      .values({
        startedAt: NOW,
        finishedAt: NOW,
        invoiceCount: 1,
        invoicedTotalCents: 814100,
        recoverableTotalCents: 18500,
        findingCount: 1,
      })
      .returning()
      .get();
    db.insert(findings)
      .values(finding(run.id, invoice.id, "freight:k:NL-88310:freight"))
      .run();
    expect(() =>
      db
        .insert(findings)
        .values(finding(run.id, invoice.id, "freight:k:NL-88310:freight"))
        .run(),
    ).toThrow(/UNIQUE/);
  });

  it.each([null, "", "   "])(
    "refuses a rejected decision with reason %j",
    (reason) => {
      expect(() =>
        db
          .insert(decisions)
          .values({
            findingKey: "k",
            status: "rejected",
            reason,
            amountCents: 0,
            decidedAt: NOW,
          })
          .run(),
      ).toThrow(/CHECK/);
    },
  );

  it("accepts an approval without a reason and a rejection with one", () => {
    db.insert(decisions)
      .values({
        findingKey: "a",
        status: "approved",
        reason: null,
        amountCents: 1,
        decidedAt: NOW,
      })
      .run();
    db.insert(decisions)
      .values({
        findingKey: "b",
        status: "rejected",
        reason: "Credit issued",
        amountCents: 1,
        decidedAt: NOW,
      })
      .run();
    expect(db.select().from(decisions).all()).toHaveLength(2);
  });

  it("refuses a negative cents value", () => {
    const invoice = seedInvoice(db);
    expect(() =>
      db
        .insert(invoiceLines)
        .values(line(invoice.id, 1, 1, -100))
        .run(),
    ).toThrow(/CHECK/);
  });

  it("refuses a zero quantity", () => {
    const invoice = seedInvoice(db);
    expect(() =>
      db
        .insert(invoiceLines)
        .values(line(invoice.id, 1, 0))
        .run(),
    ).toThrow(/CHECK/);
  });

  it("refuses a line for an invoice that does not exist", () => {
    expect(() =>
      db
        .insert(invoiceLines)
        .values(line(999, 1, 1))
        .run(),
    ).toThrow(/FOREIGN KEY/);
  });

  it("refuses a surcharge charge with no surcharge type", () => {
    const invoice = seedInvoice(db);
    expect(() =>
      db.$client
        .prepare(
          `INSERT INTO invoice_charges (invoice_id, line_no, kind, surcharge_type, label, amount_cents)
           VALUES (?, 1, 'surcharge', NULL, 'Fuel', 100)`,
        )
        .run(invoice.id),
    ).toThrow(/CHECK/);
  });

  it("deletes a document's records with it", () => {
    const invoice = seedInvoice(db);
    db.insert(invoiceLines)
      .values(line(invoice.id, 1, 1))
      .run();
    db.delete(documents).run();
    expect(db.select().from(invoices).all()).toEqual([]);
    expect(db.select().from(invoiceLines).all()).toEqual([]);
  });
});
