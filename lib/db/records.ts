import "server-only";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import type { DocumentKind } from "@/lib/schemas/enums";
import type {
  AuditInput,
  ContractRecord,
  InvoiceRecord,
  PaymentRecord,
  PurchaseOrderRecord,
  ReceiptRecord,
} from "@/lib/schemas/records";
import { err, ok, type Result } from "@/lib/schemas/result";
import type { Db } from "./client";
import {
  contractPrices,
  contracts,
  contractSurcharges,
  documents,
  invoiceCharges,
  invoiceLines,
  invoices,
  payments,
  poLines,
  purchaseOrders,
  receipts,
  suppliers,
} from "./schema";

/** A transaction handle; same query API as `Db`. */
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Supplier row id for a key, creating it with this name when it is the first seen. */
const upsertSupplier = (tx: Tx, key: string, name: string): number => {
  tx.insert(suppliers).values({ key, name }).onConflictDoNothing().run();
  const row = tx
    .select({ id: suppliers.id })
    .from(suppliers)
    .where(eq(suppliers.key, key))
    .get();
  if (!row) throw new Error(`supplier ${key} missing after upsert`);
  return row.id;
};

/** Records land and the document turns `done` in one transaction (spec 0002, key invariants). */
const markDone = (
  tx: Tx,
  documentId: number,
  kind: DocumentKind,
  now: number,
): void => {
  tx.update(documents)
    .set({ status: "done", kind, error: null, updatedAt: now })
    .where(eq(documents.id, documentId))
    .run();
};

const documentExists = (db: Db, documentId: number): boolean =>
  db
    .select({ id: documents.id })
    .from(documents)
    .where(eq(documents.id, documentId))
    .get() !== undefined;

const missingDocument = (documentId: number): Result<never> =>
  err(`document ${documentId} does not exist`);

export const saveInvoice = (
  db: Db,
  record: InvoiceRecord,
  now: number = Date.now(),
): Result<number> => {
  if (!documentExists(db, record.documentId))
    return missingDocument(record.documentId);
  return db.transaction((tx) => {
    const supplierId = upsertSupplier(
      tx,
      record.supplierKey,
      record.supplierName,
    );
    const { id } = tx
      .insert(invoices)
      .values({
        documentId: record.documentId,
        supplierId,
        invoiceNumber: record.invoiceNumber,
        invoiceDate: record.invoiceDate,
        poNumber: record.poNumber,
        currency: record.currency,
        subtotalCents: record.subtotalCents,
        totalCents: record.totalCents,
      })
      .returning({ id: invoices.id })
      .get();
    tx.insert(invoiceLines)
      .values(record.lines.map((line) => ({ ...line, invoiceId: id })))
      .run();
    if (record.charges.length > 0) {
      tx.insert(invoiceCharges)
        .values(record.charges.map((charge) => ({ ...charge, invoiceId: id })))
        .run();
    }
    markDone(tx, record.documentId, "invoice", now);
    return ok(id);
  });
};

/** The supplier's contract whose term shares at least one day with `record`'s, if any. */
const overlappingContract = (tx: Tx, record: ContractRecord) =>
  tx
    .select({
      contractNumber: contracts.contractNumber,
      startDate: contracts.startDate,
      endDate: contracts.endDate,
    })
    .from(contracts)
    .innerJoin(suppliers, eq(contracts.supplierId, suppliers.id))
    .where(
      and(
        eq(suppliers.key, record.supplierKey),
        lte(contracts.startDate, record.endDate),
        gte(contracts.endDate, record.startDate),
      ),
    )
    .get();

/** Saves a contract, refusing one whose term overlaps another of the same supplier (AC-10). */
export const saveContract = (
  db: Db,
  record: ContractRecord,
  now: number = Date.now(),
): Result<number> => {
  if (!documentExists(db, record.documentId))
    return missingDocument(record.documentId);
  return db.transaction((tx) => {
    const overlap = overlappingContract(tx, record);
    if (overlap) {
      return err(
        `contract ${record.contractNumber} (${record.startDate} to ${record.endDate}) overlaps ` +
          `${overlap.contractNumber} (${overlap.startDate} to ${overlap.endDate}) for the same supplier`,
      );
    }
    const supplierId = upsertSupplier(
      tx,
      record.supplierKey,
      record.supplierName,
    );
    const { id } = tx
      .insert(contracts)
      .values({
        documentId: record.documentId,
        supplierId,
        contractNumber: record.contractNumber,
        startDate: record.startDate,
        endDate: record.endDate,
        currency: record.currency,
        freightTerms: record.freightTerms,
        freightClause: record.freightClause,
        surchargeClause: record.surchargeClause,
      })
      .returning({ id: contracts.id })
      .get();
    tx.insert(contractPrices)
      .values(record.prices.map((price) => ({ ...price, contractId: id })))
      .run();
    if (record.surcharges.length > 0) {
      tx.insert(contractSurcharges)
        .values(
          record.surcharges.map((surcharge) => ({
            ...surcharge,
            contractId: id,
          })),
        )
        .run();
    }
    markDone(tx, record.documentId, "contract", now);
    return ok(id);
  });
};

export const savePurchaseOrder = (
  db: Db,
  record: PurchaseOrderRecord,
  now: number = Date.now(),
): Result<number> => {
  if (!documentExists(db, record.documentId))
    return missingDocument(record.documentId);
  return db.transaction((tx) => {
    const supplierId = upsertSupplier(
      tx,
      record.supplierKey,
      record.supplierName,
    );
    const { id } = tx
      .insert(purchaseOrders)
      .values({
        documentId: record.documentId,
        supplierId,
        poNumber: record.poNumber,
        orderDate: record.orderDate,
        currency: record.currency,
      })
      .returning({ id: purchaseOrders.id })
      .get();
    tx.insert(poLines)
      .values(record.lines.map((line) => ({ ...line, poId: id })))
      .run();
    markDone(tx, record.documentId, "purchase_order", now);
    return ok(id);
  });
};

/** CSV rows must all belong to the document they are saved under. */
const checkRows = (
  db: Db,
  documentId: number,
  rows: readonly { documentId: number }[],
): Result<true> => {
  if (!documentExists(db, documentId)) return missingDocument(documentId);
  const stray = rows.find((row) => row.documentId !== documentId);
  return stray
    ? err(`a row belongs to document ${stray.documentId}, not ${documentId}`)
    : ok(true);
};

export const saveReceipts = (
  db: Db,
  documentId: number,
  records: readonly ReceiptRecord[],
  now: number = Date.now(),
): Result<number> => {
  const checked = checkRows(db, documentId, records);
  if (!checked.ok) return checked;
  return db.transaction((tx) => {
    if (records.length > 0) {
      tx.insert(receipts)
        .values(
          records.map((record) => ({
            documentId,
            rowNo: record.rowNo,
            poNumber: record.poNumber,
            sku: record.sku,
            quantityReceived: record.quantityReceived,
            receivedDate: record.receivedDate,
          })),
        )
        .run();
    }
    markDone(tx, documentId, "receipts_csv", now);
    return ok(records.length);
  });
};

export const savePayments = (
  db: Db,
  documentId: number,
  records: readonly PaymentRecord[],
  now: number = Date.now(),
): Result<number> => {
  const checked = checkRows(db, documentId, records);
  if (!checked.ok) return checked;
  return db.transaction((tx) => {
    const rows = records.map((record) => ({
      documentId,
      rowNo: record.rowNo,
      supplierId: upsertSupplier(tx, record.supplierKey, record.supplierName),
      invoiceNumber: record.invoiceNumber,
      amountCents: record.amountCents,
      paidDate: record.paidDate,
      reference: record.reference,
    }));
    if (rows.length > 0) tx.insert(payments).values(rows).run();
    markDone(tx, documentId, "payments_csv", now);
    return ok(records.length);
  });
};

/** Groups selected children under their parent id, keeping query order. */
const childrenByParent = <T>(
  rows: readonly { readonly parentId: number; readonly child: T }[],
): ReadonlyMap<number, readonly T[]> =>
  rows.reduce(
    (groups, { parentId, child }) =>
      new Map(groups).set(parentId, [...(groups.get(parentId) ?? []), child]),
    new Map<number, readonly T[]>(),
  );

const docRef = { documentId: documents.id, filename: documents.filename };
const supplierRef = {
  supplierKey: suppliers.key,
  supplierName: suppliers.name,
};

const loadInvoices = (db: Db): readonly InvoiceRecord[] => {
  const heads = db
    .select({ id: invoices.id, ...docRef, ...supplierRef, invoice: invoices })
    .from(invoices)
    .innerJoin(documents, eq(invoices.documentId, documents.id))
    .innerJoin(suppliers, eq(invoices.supplierId, suppliers.id))
    .orderBy(asc(invoices.id))
    .all();
  const lines = childrenByParent(
    db
      .select({
        parentId: invoiceLines.invoiceId,
        child: {
          lineNo: invoiceLines.lineNo,
          sku: invoiceLines.sku,
          description: invoiceLines.description,
          quantity: invoiceLines.quantity,
          unitPriceCents: invoiceLines.unitPriceCents,
          amountCents: invoiceLines.amountCents,
        },
      })
      .from(invoiceLines)
      .orderBy(asc(invoiceLines.lineNo))
      .all(),
  );
  const charges = childrenByParent(
    db
      .select({
        parentId: invoiceCharges.invoiceId,
        child: {
          lineNo: invoiceCharges.lineNo,
          kind: invoiceCharges.kind,
          surchargeType: invoiceCharges.surchargeType,
          label: invoiceCharges.label,
          rateBps: invoiceCharges.rateBps,
          amountCents: invoiceCharges.amountCents,
        },
      })
      .from(invoiceCharges)
      .orderBy(asc(invoiceCharges.lineNo))
      .all(),
  );
  return heads.map(
    ({ id, documentId, filename, supplierKey, supplierName, invoice }) => ({
      documentId,
      filename,
      supplierKey,
      supplierName,
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.invoiceDate,
      poNumber: invoice.poNumber,
      currency: invoice.currency as InvoiceRecord["currency"],
      subtotalCents: invoice.subtotalCents,
      totalCents: invoice.totalCents,
      lines: lines.get(id) ?? [],
      charges: charges.get(id) ?? [],
    }),
  );
};

const loadContracts = (db: Db): readonly ContractRecord[] => {
  const heads = db
    .select({
      id: contracts.id,
      ...docRef,
      ...supplierRef,
      contract: contracts,
    })
    .from(contracts)
    .innerJoin(documents, eq(contracts.documentId, documents.id))
    .innerJoin(suppliers, eq(contracts.supplierId, suppliers.id))
    .orderBy(asc(contracts.id))
    .all();
  const prices = childrenByParent(
    db
      .select({
        parentId: contractPrices.contractId,
        child: {
          sku: contractPrices.sku,
          description: contractPrices.description,
          unitPriceCents: contractPrices.unitPriceCents,
          clause: contractPrices.clause,
        },
      })
      .from(contractPrices)
      .orderBy(asc(contractPrices.id))
      .all(),
  );
  const surcharges = childrenByParent(
    db
      .select({
        parentId: contractSurcharges.contractId,
        child: {
          surchargeType: contractSurcharges.surchargeType,
          capBps: contractSurcharges.capBps,
          clause: contractSurcharges.clause,
        },
      })
      .from(contractSurcharges)
      .orderBy(asc(contractSurcharges.id))
      .all(),
  );
  return heads.map(
    ({ id, documentId, filename, supplierKey, supplierName, contract }) => ({
      documentId,
      filename,
      supplierKey,
      supplierName,
      contractNumber: contract.contractNumber,
      startDate: contract.startDate,
      endDate: contract.endDate,
      currency: contract.currency as ContractRecord["currency"],
      freightTerms: contract.freightTerms,
      freightClause: contract.freightClause,
      surchargeClause: contract.surchargeClause,
      prices: prices.get(id) ?? [],
      surcharges: surcharges.get(id) ?? [],
    }),
  );
};

const loadPurchaseOrders = (db: Db): readonly PurchaseOrderRecord[] => {
  const heads = db
    .select({
      id: purchaseOrders.id,
      ...docRef,
      ...supplierRef,
      po: purchaseOrders,
    })
    .from(purchaseOrders)
    .innerJoin(documents, eq(purchaseOrders.documentId, documents.id))
    .innerJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
    .orderBy(asc(purchaseOrders.id))
    .all();
  const lines = childrenByParent(
    db
      .select({
        parentId: poLines.poId,
        child: {
          lineNo: poLines.lineNo,
          sku: poLines.sku,
          description: poLines.description,
          quantity: poLines.quantity,
          unitPriceCents: poLines.unitPriceCents,
        },
      })
      .from(poLines)
      .orderBy(asc(poLines.lineNo))
      .all(),
  );
  return heads.map(
    ({ id, documentId, filename, supplierKey, supplierName, po }) => ({
      documentId,
      filename,
      supplierKey,
      supplierName,
      poNumber: po.poNumber,
      orderDate: po.orderDate,
      currency: po.currency as PurchaseOrderRecord["currency"],
      lines: lines.get(id) ?? [],
    }),
  );
};

const loadReceipts = (db: Db): readonly ReceiptRecord[] =>
  db
    .select({
      ...docRef,
      rowNo: receipts.rowNo,
      poNumber: receipts.poNumber,
      sku: receipts.sku,
      quantityReceived: receipts.quantityReceived,
      receivedDate: receipts.receivedDate,
    })
    .from(receipts)
    .innerJoin(documents, eq(receipts.documentId, documents.id))
    .orderBy(asc(receipts.documentId), asc(receipts.rowNo))
    .all();

const loadPayments = (db: Db): readonly PaymentRecord[] =>
  db
    .select({
      ...docRef,
      ...supplierRef,
      rowNo: payments.rowNo,
      invoiceNumber: payments.invoiceNumber,
      amountCents: payments.amountCents,
      paidDate: payments.paidDate,
      reference: payments.reference,
    })
    .from(payments)
    .innerJoin(documents, eq(payments.documentId, documents.id))
    .innerJoin(suppliers, eq(payments.supplierId, suppliers.id))
    .orderBy(asc(payments.documentId), asc(payments.rowNo))
    .all();

/** Everything the checks read, in cents, with each record's file and supplier. No database needed after this. */
export const loadAuditInput = (db: Db): AuditInput => ({
  invoices: loadInvoices(db),
  contracts: loadContracts(db),
  purchaseOrders: loadPurchaseOrders(db),
  receipts: loadReceipts(db),
  payments: loadPayments(db),
});
