import { z } from "zod";

/** Shared enums: one source for extraction, records and the Drizzle columns (spec 0002). */

export const SurchargeType = z.enum(["fuel", "energy", "other"]);
export type SurchargeType = z.infer<typeof SurchargeType>;

export const ChargeKind = z.enum(["surcharge", "freight", "other"]);
export type ChargeKind = z.infer<typeof ChargeKind>;

export const FreightTerms = z.enum(["included", "billable", "not_stated"]);
export type FreightTerms = z.infer<typeof FreightTerms>;

export const DocumentKind = z.enum([
  "invoice",
  "contract",
  "purchase_order",
  "receipts_csv",
  "payments_csv",
]);
export type DocumentKind = z.infer<typeof DocumentKind>;

export const DocumentStatus = z.enum([
  "queued",
  "extracting",
  "done",
  "failed",
]);
export type DocumentStatus = z.infer<typeof DocumentStatus>;

export const DocumentSource = z.enum(["upload", "webhook", "sample"]);
export type DocumentSource = z.infer<typeof DocumentSource>;

export const CheckId = z.enum([
  "contract_price",
  "duplicate",
  "quantity_received",
  "surcharge",
  "freight",
  "missing_reference",
]);
export type CheckId = z.infer<typeof CheckId>;

export const FindingAction = z.enum([
  "recover",
  "block_payment",
  "review_only",
]);
export type FindingAction = z.infer<typeof FindingAction>;

export const DecisionStatus = z.enum(["approved", "rejected"]);
export type DecisionStatus = z.infer<typeof DecisionStatus>;

/** The only currency v1 accepts (spec 0002, AC-6). */
export const CURRENCY = "USD";
