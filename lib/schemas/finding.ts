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

/** An analyst's Approve or Reject. A rejection needs a reason. */
export const DecisionInput = z
  .object({
    findingKey: z.string().min(1),
    status: DecisionStatus,
    reason: z.string().nullable(),
  })
  .readonly()
  .refine((input) => input.status === "approved" || !isBlank(input.reason), {
    message: "A reason is required to reject a finding",
    path: ["reason"],
  });
export type DecisionInput = z.infer<typeof DecisionInput>;

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
