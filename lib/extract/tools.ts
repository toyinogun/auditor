import "server-only";
import type { Tool } from "@anthropic-ai/sdk/resources/messages";
import { z } from "zod";
import type { DocumentKind } from "@/lib/schemas/enums";
import {
  ContractExtraction,
  InvoiceExtraction,
  PurchaseOrderExtraction,
} from "@/lib/schemas/extraction";

/**
 * The four tools (spec 0005, AC-1). The tool Claude calls is the classification and its input
 * is the extraction, so each record tool's schema comes straight from the shared extraction
 * shape. Zod still parses the input afterwards; the schema here only steers the model.
 */

type JsonSchema = { readonly [key: string]: unknown };

/** Keywords strict tool schemas do not support. Zod checks them after the call instead. */
const UNSUPPORTED_KEYWORDS: ReadonlySet<string> = new Set([
  "$schema",
  "minLength",
  "maxLength",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "maxItems",
]);

const isObject = (value: unknown): value is JsonSchema =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const strictValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(strictValue);
  return isObject(value) ? toStrictSchema(value) : value;
};

/** Strict tools accept `minItems` of 0 or 1 only. */
const keepKeyword = ([key, value]: readonly [string, unknown]): boolean =>
  !UNSUPPORTED_KEYWORDS.has(key) &&
  !(key === "minItems" && typeof value === "number" && value > 1);

/**
 * Makes a generated schema strict at every depth: each object node gets
 * `additionalProperties: false` and lists every property as required (a nullable field is
 * required and may be `null`). Pure; returns a new schema.
 */
export const toStrictSchema = (schema: JsonSchema): JsonSchema => {
  const walked = Object.fromEntries(
    Object.entries(schema)
      .filter(keepKeyword)
      .map(([key, value]) =>
        key === "properties" && isObject(value)
          ? [
              key,
              Object.fromEntries(
                Object.entries(value).map(([name, child]) => [
                  name,
                  strictValue(child),
                ]),
              ),
            ]
          : [key, strictValue(value)],
      ),
  );
  if (walked.type !== "object") return walked;
  const properties = isObject(walked.properties) ? walked.properties : {};
  return {
    ...walked,
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  };
};

type RecordKind = Exclude<DocumentKind, "receipts_csv" | "payments_csv">;

export const RECORD_TOOL = {
  invoice: "record_invoice",
  contract: "record_contract",
  purchase_order: "record_purchase_order",
} as const satisfies Record<RecordKind, string>;

export const REJECT_TOOL = "reject_document";

export type ExtractedKind = keyof typeof RECORD_TOOL;

/** Tool name to document kind (AC-3). `reject_document` is not a kind. */
export const KIND_BY_TOOL: Readonly<Record<string, ExtractedKind>> = {
  [RECORD_TOOL.invoice]: "invoice",
  [RECORD_TOOL.contract]: "contract",
  [RECORD_TOOL.purchase_order]: "purchase_order",
};

const inputSchema = (shape: z.ZodType): Tool["input_schema"] => {
  const strict = toStrictSchema(z.toJSONSchema(shape) as JsonSchema);
  if (strict.type !== "object") {
    throw new Error("an extraction shape must be a JSON object schema");
  }
  return strict as Tool["input_schema"];
};

const RejectInput = z.object({
  reason: z
    .string()
    .describe(
      "Why this is not an invoice, contract or purchase order, in one sentence",
    ),
});

/** The four tools in a fixed order, so the request prefix stays byte stable for caching. */
const TOOLS: readonly Tool[] = [
  {
    name: RECORD_TOOL.invoice,
    description:
      "Record a supplier invoice: a bill that asks for payment for goods, with lines, charges and a total.",
    input_schema: inputSchema(InvoiceExtraction),
    strict: true,
  },
  {
    name: RECORD_TOOL.contract,
    description:
      "Record a supply contract: agreed unit prices for a term, with freight and surcharge terms.",
    input_schema: inputSchema(ContractExtraction),
    strict: true,
  },
  {
    name: RECORD_TOOL.purchase_order,
    description:
      "Record a purchase order: a buyer's order to a supplier listing items and quantities.",
    input_schema: inputSchema(PurchaseOrderExtraction),
    strict: true,
  },
  {
    name: REJECT_TOOL,
    description:
      "Use when the document is not an invoice, a contract or a purchase order.",
    input_schema: inputSchema(RejectInput),
    strict: true,
  },
];

export const toolsFor = (): readonly Tool[] => TOOLS;
