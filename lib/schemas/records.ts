import { z } from "zod";
import { ChargeKind, CURRENCY, FreightTerms, SurchargeType } from "./enums";

/**
 * Record layer (spec 0002): what the checks read. Money is integer cents, rates are integer
 * basis points, everything is readonly. Records carry their document and locators (clause,
 * `lineNo`, `rowNo`) so a check can build evidence without the database.
 */

const cents = z.int().nonnegative();
const bps = z.int().nonnegative();
const quantity = z.int().positive();
const lineNo = z.int().positive();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const documentRef = {
  documentId: z.int().positive(),
  filename: z.string().min(1),
};

const supplierRef = {
  supplierKey: z.string().min(1),
  supplierName: z.string().min(1),
};

export const InvoiceLineRecord = z
  .object({
    lineNo,
    sku: z.string(),
    description: z.string(),
    quantity,
    unitPriceCents: cents,
    amountCents: cents,
  })
  .readonly();
export type InvoiceLineRecord = z.infer<typeof InvoiceLineRecord>;

export const InvoiceChargeRecord = z
  .object({
    lineNo,
    kind: ChargeKind,
    surchargeType: SurchargeType.nullable(),
    label: z.string(),
    rateBps: bps.nullable(),
    amountCents: cents,
  })
  .readonly();
export type InvoiceChargeRecord = z.infer<typeof InvoiceChargeRecord>;

export const InvoiceRecord = z
  .object({
    ...documentRef,
    ...supplierRef,
    invoiceNumber: z.string().min(1),
    invoiceDate: date,
    poNumber: z.string().nullable(),
    currency: z.literal(CURRENCY),
    subtotalCents: cents,
    totalCents: cents,
    lines: z.array(InvoiceLineRecord).readonly(),
    charges: z.array(InvoiceChargeRecord).readonly(),
  })
  .readonly();
export type InvoiceRecord = z.infer<typeof InvoiceRecord>;

export const ContractPriceRecord = z
  .object({
    sku: z.string(),
    description: z.string(),
    unitPriceCents: cents,
    clause: z.string(),
  })
  .readonly();
export type ContractPriceRecord = z.infer<typeof ContractPriceRecord>;

export const ContractSurchargeRecord = z
  .object({
    surchargeType: SurchargeType,
    capBps: bps.nullable(),
    clause: z.string(),
  })
  .readonly();
export type ContractSurchargeRecord = z.infer<typeof ContractSurchargeRecord>;

export const ContractRecord = z
  .object({
    ...documentRef,
    ...supplierRef,
    contractNumber: z.string().min(1),
    startDate: date,
    endDate: date,
    currency: z.literal(CURRENCY),
    freightTerms: FreightTerms,
    freightClause: z.string().nullable(),
    surchargeClause: z.string().nullable(),
    prices: z.array(ContractPriceRecord).readonly(),
    surcharges: z.array(ContractSurchargeRecord).readonly(),
  })
  .readonly();
export type ContractRecord = z.infer<typeof ContractRecord>;

export const PurchaseOrderLineRecord = z
  .object({
    lineNo,
    sku: z.string(),
    description: z.string(),
    quantity,
    /** Display only; no check reads it. */
    unitPriceCents: cents.nullable(),
  })
  .readonly();
export type PurchaseOrderLineRecord = z.infer<typeof PurchaseOrderLineRecord>;

export const PurchaseOrderRecord = z
  .object({
    ...documentRef,
    ...supplierRef,
    poNumber: z.string().min(1),
    orderDate: date,
    currency: z.literal(CURRENCY),
    lines: z.array(PurchaseOrderLineRecord).readonly(),
  })
  .readonly();
export type PurchaseOrderRecord = z.infer<typeof PurchaseOrderRecord>;

export const ReceiptRecord = z
  .object({
    ...documentRef,
    rowNo: lineNo,
    poNumber: z.string().min(1),
    sku: z.string().min(1),
    quantityReceived: quantity,
    receivedDate: date,
  })
  .readonly();
export type ReceiptRecord = z.infer<typeof ReceiptRecord>;

export const PaymentRecord = z
  .object({
    ...documentRef,
    ...supplierRef,
    rowNo: lineNo,
    invoiceNumber: z.string().min(1),
    amountCents: cents,
    paidDate: date,
    reference: z.string().nullable(),
  })
  .readonly();
export type PaymentRecord = z.infer<typeof PaymentRecord>;

/** Everything one audit run reads. */
export const AuditInput = z
  .object({
    invoices: z.array(InvoiceRecord).readonly(),
    contracts: z.array(ContractRecord).readonly(),
    purchaseOrders: z.array(PurchaseOrderRecord).readonly(),
    receipts: z.array(ReceiptRecord).readonly(),
    payments: z.array(PaymentRecord).readonly(),
  })
  .readonly();
export type AuditInput = z.infer<typeof AuditInput>;

/** Which stored document a record came from. */
export type DocumentRef = {
  readonly documentId: number;
  readonly filename: string;
};
