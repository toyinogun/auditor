import { z } from "zod";
import { ChargeKind, FreightTerms, SurchargeType } from "./enums";

/**
 * Extraction layer (spec 0002): what the model's tool call and the offline JSON copies hold.
 * Money and rates stay as printed text; `lib/schemas/convert.ts` turns them into cents and
 * basis points and enforces every money, quantity, currency and arithmetic rule.
 */

const printed = (what: string) => z.string().min(1).describe(what);
const moneyText = (what: string) =>
  printed(
    `${what}, copied as printed without symbol or thousands separator, e.g. "1234.56"`,
  );
const dateText = (what: string) => printed(`${what} as YYYY-MM-DD`);
const quantity = z.number().describe("Quantity as a whole number");

export const InvoiceLineExtraction = z.object({
  sku: printed("Supplier SKU or item code"),
  description: printed("Line description"),
  quantity,
  unitPrice: moneyText("Unit price"),
  amount: moneyText("Line amount"),
});

export const InvoiceChargeExtraction = z.object({
  kind: ChargeKind.describe("surcharge, freight, or other"),
  surchargeType: SurchargeType.nullable().describe(
    "fuel, energy or other when kind is surcharge, else null",
  ),
  label: printed("Charge label as printed"),
  rate: z
    .string()
    .nullable()
    .describe(
      'Printed percent without the % sign, e.g. "2.5", or null when none is printed',
    ),
  amount: moneyText("Charge amount"),
});

export const InvoiceExtraction = z.object({
  invoiceNumber: printed(
    "Invoice number exactly as printed, punctuation included",
  ),
  supplierName: printed("Supplier name as printed"),
  invoiceDate: dateText("Invoice date"),
  poNumber: z
    .string()
    .min(1)
    .nullable()
    .describe("Purchase order number, or null when none"),
  currency: printed("ISO currency code, e.g. USD"),
  lines: z.array(InvoiceLineExtraction).min(1),
  charges: z.array(InvoiceChargeExtraction),
  subtotal: moneyText("Goods subtotal before charges"),
  total: moneyText("Invoice total"),
});
export type InvoiceExtraction = z.infer<typeof InvoiceExtraction>;

export const ContractPriceExtraction = z.object({
  sku: printed("Supplier SKU or item code"),
  description: printed("Item description"),
  unitPrice: moneyText("Agreed unit price"),
  clause: printed('Where the price is printed, e.g. "Schedule A, item 1"'),
});

export const ContractSurchargeExtraction = z.object({
  surchargeType: SurchargeType,
  capRate: z
    .string()
    .nullable()
    .describe(
      'Cap as a percent of the goods subtotal, e.g. "2.5", or null for no cap',
    ),
  clause: printed("Clause that permits the surcharge"),
});

export const ContractExtraction = z.object({
  contractNumber: printed("Contract number as printed"),
  supplierName: printed("Supplier name as printed"),
  startDate: dateText("First day of the term"),
  endDate: dateText("Last day of the term"),
  currency: printed("ISO currency code, e.g. USD"),
  prices: z.array(ContractPriceExtraction).min(1),
  freightTerms: FreightTerms.describe(
    "included when freight is in the price, billable when it may be charged, else not_stated",
  ),
  freightClause: z
    .string()
    .min(1)
    .nullable()
    .describe("Clause on freight, or null"),
  surchargeClause: z
    .string()
    .min(1)
    .nullable()
    .describe("Clause on surcharges, or null"),
  surcharges: z
    .array(ContractSurchargeExtraction)
    .describe("Surcharges the contract permits; empty when none are permitted"),
});
export type ContractExtraction = z.infer<typeof ContractExtraction>;

export const PurchaseOrderLineExtraction = z.object({
  sku: printed("Supplier SKU or item code"),
  description: printed("Line description"),
  quantity,
  unitPrice: z
    .string()
    .nullable()
    .describe("Unit price as printed, or null when not printed"),
});

export const PurchaseOrderExtraction = z.object({
  poNumber: printed("Purchase order number as printed"),
  supplierName: printed("Supplier name as printed"),
  orderDate: dateText("Order date"),
  currency: printed("ISO currency code, e.g. USD"),
  lines: z.array(PurchaseOrderLineExtraction).min(1),
});
export type PurchaseOrderExtraction = z.infer<typeof PurchaseOrderExtraction>;

/** One data row of `receipts.csv`, every cell as text. */
export const ReceiptCsvRow = z.object({
  po_number: z.string(),
  sku: z.string(),
  quantity_received: z.string(),
  received_date: z.string(),
});
export type ReceiptCsvRow = z.infer<typeof ReceiptCsvRow>;

/** One data row of `ap_payments.csv`, every cell as text. */
export const PaymentCsvRow = z.object({
  invoice_number: z.string(),
  supplier: z.string(),
  amount: z.string(),
  paid_date: z.string(),
  reference: z.string(),
});
export type PaymentCsvRow = z.infer<typeof PaymentCsvRow>;
