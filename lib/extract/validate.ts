import "server-only";
import type {
  Message,
  ToolUseBlock,
} from "@anthropic-ai/sdk/resources/messages";
import {
  toContractRecord,
  toInvoiceRecord,
  toPurchaseOrderRecord,
} from "@/lib/schemas/convert";
import type {
  ContractExtraction,
  InvoiceExtraction,
  PurchaseOrderExtraction,
} from "@/lib/schemas/extraction";
import type { DocumentRef } from "@/lib/schemas/records";
import { err, ok, type Result } from "@/lib/schemas/result";
import { KIND_BY_TOOL, REJECT_TOOL, type ExtractedKind } from "./tools";

/** A classified document with its extraction, discriminated by `kind` (AC-3). */
export type Classified =
  | { readonly kind: "invoice"; readonly extraction: InvoiceExtraction }
  | { readonly kind: "contract"; readonly extraction: ContractExtraction }
  | {
      readonly kind: "purchase_order";
      readonly extraction: PurchaseOrderExtraction;
    };

/** Why a response did not give a record. Only `invalid` earns the repair turn (AC-4). */
export type ValidationFailure =
  | {
      readonly type: "invalid";
      readonly reason: string;
      readonly toolUseId: string;
    }
  | {
      readonly type: "rejected" | "refused" | "cut_off" | "no_tool";
      readonly reason: string;
    };

type Converter = (input: unknown, ref: DocumentRef) => Result<unknown>;

const CONVERTER: Readonly<Record<ExtractedKind, Converter>> = {
  invoice: toInvoiceRecord,
  contract: toContractRecord,
  purchase_order: toPurchaseOrderRecord,
};

const rejectReason = (input: unknown): string =>
  typeof input === "object" &&
  input !== null &&
  "reason" in input &&
  typeof input.reason === "string" &&
  input.reason.trim().length > 0
    ? input.reason.trim()
    : "no reason given";

const judgeToolCall = (
  block: ToolUseBlock,
  filename: string,
): Result<Classified, ValidationFailure> => {
  if (block.name === REJECT_TOOL) {
    return err({ type: "rejected", reason: rejectReason(block.input) });
  }
  const kind = KIND_BY_TOOL[block.name];
  if (kind === undefined) {
    return err({
      type: "invalid",
      reason: `unknown tool ${block.name}`,
      toolUseId: block.id,
    });
  }
  // The converter parses the shape itself (AC-3); its record is dropped here and the caller
  // converts again with the real document ref, which gives the same result (pure converters).
  const converted = CONVERTER[kind](block.input, { documentId: 0, filename });
  if (!converted.ok) {
    return err({
      type: "invalid",
      reason: converted.error,
      toolUseId: block.id,
    });
  }
  // The input just passed the extraction shape's parse inside the converter.
  return ok({ kind, extraction: block.input } as Classified);
};

/** Judges one response: its stop reason, then its one tool call (spec 0005, AC-3 to AC-6). Pure. */
export const validateToolCall = (
  message: Message,
  filename: string,
): Result<Classified, ValidationFailure> => {
  if (message.stop_reason === "refusal") {
    return err({ type: "refused", reason: "the model refused the document" });
  }
  if (message.stop_reason === "max_tokens") {
    return err({ type: "cut_off", reason: "output cut off at max_tokens" });
  }
  const block = message.content.find(
    (content): content is ToolUseBlock => content.type === "tool_use",
  );
  if (block === undefined) {
    return err({ type: "no_tool", reason: "the model called no tool" });
  }
  return judgeToolCall(block, filename);
};
