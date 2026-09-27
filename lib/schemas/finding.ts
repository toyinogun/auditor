import { z } from "zod";
import { CheckId, DecisionStatus, FindingAction } from "./enums";

/** One figure behind a finding and exactly where it was read. */
export const EvidenceItem = z
  .object({
    label: z.string().min(1),
    value: z.string().min(1),
    source: z
      .object({
        documentId: z.int().positive(),
        filename: z.string().min(1),
        /** A clause, "line N", "row N", or a fixed invoice level label such as "Invoice total". */
        locator: z.string().min(1),
      })
      .readonly(),
  })
  .readonly();
export type EvidenceItem = z.infer<typeof EvidenceItem>;

/** What a check produces. SQLite cannot check a JSON array's length, so the minimum lives here. */
export const Finding = z
  .object({
    findingKey: z.string().min(1),
    checkId: CheckId,
    action: FindingAction,
    /** The flagged invoice's document; `saveAuditRun` resolves it to the invoice row. */
    invoiceDocumentId: z.int().positive(),
    amountCents: z.int().nonnegative(),
    title: z.string().min(1),
    calculation: z.string().min(1),
    evidence: z.array(EvidenceItem).min(1).readonly(),
  })
  .readonly();
export type Finding = z.infer<typeof Finding>;

const isBlank = (text: string | null): boolean =>
  text === null || text.trim().length === 0;

/** The longest rejection reason an analyst can store (spec 0008, AC-9). */
export const DECISION_REASON_MAX_LENGTH = 500;

/** An analyst's Approve or Reject. A rejection needs a reason of at most 500 characters. */
export const DecisionInput = z
  .object({
    findingKey: z.string().min(1),
    status: DecisionStatus,
    reason: z.string().max(DECISION_REASON_MAX_LENGTH).nullable(),
  })
  .readonly()
  .refine((input) => input.status === "approved" || !isBlank(input.reason), {
    message: "A reason is required to reject a finding",
    path: ["reason"],
  });
export type DecisionInput = z.infer<typeof DecisionInput>;

/** Why a decision was not stored: a bad input, or a finding key a rerun removed (spec 0008). */
export type DecideError = {
  readonly code: "invalid_input" | "finding_not_found";
  readonly message: string;
};

/** A stored decision, with the finding amount it was made on. */
export type Decision = DecisionInput & {
  readonly amountCents: number;
  readonly decidedAt: number;
};

/** How a finding reads on the review screen. */
export type DecisionState =
  | { readonly status: "pending" }
  | {
      readonly status: DecisionStatus;
      readonly reason: string | null;
      readonly decidedAt: number;
    };
