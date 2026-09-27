import type { CheckId, FindingAction } from "@/lib/schemas/enums";
import type { DecisionState } from "@/lib/schemas/finding";

/**
 * The plain words the export writes instead of codes (spec 0009, AC-5). Exhaustive over the Zod
 * enums, so a new check, action or decision fails typecheck until it has a label.
 */

export const CHECK_LABEL: Readonly<Record<CheckId, string>> = {
  contract_price: "Price above contract",
  duplicate: "Duplicate invoice",
  quantity_received: "Quantity above received",
  surcharge: "Surcharge",
  freight: "Freight",
  missing_reference: "Missing reference",
};

export const ACTION_LABEL: Readonly<Record<FindingAction, string>> = {
  recover: "Recover",
  block_payment: "Block payment",
  review_only: "Review only",
};

export const DECISION_LABEL: Readonly<Record<DecisionState["status"], string>> =
  {
    pending: "Pending",
    approved: "Approved",
    rejected: "Rejected",
  };
