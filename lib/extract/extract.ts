import "server-only";
import { APIError } from "@anthropic-ai/sdk";
import type {
  Message,
  MessageCreateParamsNonStreaming,
} from "@anthropic-ai/sdk/resources/messages";
import { env } from "@/lib/env";
import { logEvent } from "@/lib/log";
import { err, ok, type Result } from "@/lib/schemas/result";
import { readPdf } from "./pdf";
import { buildRequest, type DocumentContent, type Repair } from "./request";
import {
  validateToolCall,
  type Classified,
  type ValidationFailure,
} from "./validate";

/**
 * `extractDocument` (spec 0005): one forced tool call classifies and extracts a PDF, a
 * validation failure gets exactly one repair turn, and every expected failure comes back as
 * `err`. It never touches the database; Feature 8 adds storage and status moves around it.
 */

export type ExtractInput = {
  readonly filename: string;
  readonly bytes: Uint8Array;
};

export type ExtractDeps = {
  readonly createMessage: (
    params: MessageCreateParamsNonStreaming,
  ) => Promise<Message>;
  readonly apiKeySet: boolean;
  readonly now: () => number;
};

export type Usage = {
  readonly inputTokens: number;
  readonly outputTokens: number;
};

export type ExtractedDocument = Classified & {
  readonly hasTextLayer: boolean;
  readonly attempts: 1 | 2;
  readonly usage: Usage;
};

type Outcome =
  | "ok"
  | "invalid"
  | "rejected"
  | "refused"
  | "cut_off"
  | "api_error"
  | "bad_input";

type InputMode = DocumentContent["mode"];

/** What one run of the pipeline produced, before it becomes a `Result` and a log line. */
type Attempted = {
  readonly result: Result<ExtractedDocument>;
  readonly outcome: Outcome;
  readonly kind: Classified["kind"] | null;
  readonly inputMode: InputMode | null;
  readonly attempts: number;
  readonly usage: Usage;
};

const NO_USAGE: Usage = { inputTokens: 0, outputTokens: 0 };

const addUsage = (total: Usage, message: Message): Usage => ({
  inputTokens: total.inputTokens + message.usage.input_tokens,
  outputTokens: total.outputTokens + message.usage.output_tokens,
});

const toBase64 = (bytes: Uint8Array): string =>
  Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString(
    "base64",
  );

/** Calls the model; an API failure the SDK could not retry away becomes `err` (AC-6). */
const call = async (
  deps: ExtractDeps,
  params: MessageCreateParamsNonStreaming,
): Promise<Result<Message>> => {
  try {
    return ok(await deps.createMessage(params));
  } catch (error) {
    if (!(error instanceof APIError)) throw error;
    return err(
      error.status === undefined
        ? "API error: the connection failed"
        : `API error: HTTP ${error.status}`,
    );
  }
};

const OUTCOME_BY_FAILURE: Readonly<Record<ValidationFailure["type"], Outcome>> =
  {
    invalid: "invalid",
    rejected: "rejected",
    refused: "refused",
    cut_off: "cut_off",
    no_tool: "invalid",
  };

const failureMessage = (
  filename: string,
  failure: ValidationFailure,
): string =>
  failure.type === "rejected"
    ? `${filename}: not an invoice, contract or purchase order: ${failure.reason}`
    : failure.reason;

type Context = {
  readonly input: ExtractInput;
  readonly deps: ExtractDeps;
  readonly content: DocumentContent;
  readonly hasTextLayer: boolean;
};

const fromModel = (
  context: Context,
  classified: Result<Classified, ValidationFailure>,
  attempts: 1 | 2,
  usage: Usage,
): Attempted => {
  const base = { inputMode: context.content.mode, attempts, usage };
  if (classified.ok) {
    return {
      ...base,
      kind: classified.value.kind,
      outcome: "ok",
      result: ok({
        ...classified.value,
        hasTextLayer: context.hasTextLayer,
        attempts,
        usage,
      }),
    };
  }
  const failure = classified.error;
  const message =
    attempts === 2
      ? `${context.input.filename}: ${failure.reason} (after 2 attempts)`
      : failureMessage(context.input.filename, failure);
  return {
    ...base,
    kind: null,
    outcome: attempts === 2 ? "invalid" : OUTCOME_BY_FAILURE[failure.type],
    result: err(message),
  };
};

const apiFailure = (
  context: Context,
  error: string,
  attempts: number,
  usage: Usage,
): Attempted => ({
  result: err(error),
  outcome: "api_error",
  kind: null,
  inputMode: context.content.mode,
  attempts,
  usage,
});

/** The repair turn: the first answer unchanged, then an `is_error` tool result (AC-4). */
const repairTurn = async (
  context: Context,
  repair: Repair,
  usage: Usage,
): Promise<Attempted> => {
  const second = await call(
    context.deps,
    buildRequest(env.ANTHROPIC_MODEL, context.content, repair),
  );
  if (!second.ok) return apiFailure(context, second.error, 2, usage);
  const total = addUsage(usage, second.value);
  return fromModel(
    context,
    validateToolCall(second.value, context.input.filename),
    2,
    total,
  );
};

const askModel = async (context: Context): Promise<Attempted> => {
  const first = await call(
    context.deps,
    buildRequest(env.ANTHROPIC_MODEL, context.content),
  );
  if (!first.ok) return apiFailure(context, first.error, 1, NO_USAGE);
  const usage = addUsage(NO_USAGE, first.value);
  const classified = validateToolCall(first.value, context.input.filename);
  if (classified.ok || classified.error.type !== "invalid") {
    return fromModel(context, classified, 1, usage);
  }
  return repairTurn(
    context,
    {
      response: first.value,
      toolUseId: classified.error.toolUseId,
      reason: classified.error.reason,
    },
    usage,
  );
};

const beforeModel = (
  result: Result<never>,
  outcome: Outcome,
  inputMode: InputMode | null,
): Attempted => ({
  result,
  outcome,
  kind: null,
  inputMode,
  attempts: 0,
  usage: NO_USAGE,
});

const attempt = async (
  input: ExtractInput,
  deps: ExtractDeps,
): Promise<Attempted> => {
  const pdf = await readPdf(input.bytes);
  if (!pdf.ok) return beforeModel(pdf, "bad_input", null);
  const { pages, hasTextLayer } = pdf.value;
  const content: DocumentContent = hasTextLayer
    ? { mode: "text", pages }
    : { mode: "pdf", base64: toBase64(input.bytes) };
  if (!deps.apiKeySet) {
    return beforeModel(
      err("ANTHROPIC_API_KEY is not set"),
      "api_error",
      content.mode,
    );
  }
  return askModel({ input, deps, content, hasTextLayer });
};

/** Reads, classifies and extracts one PDF (spec 0005). Never throws for an expected failure. */
export const extractDocument = async (
  input: ExtractInput,
  deps: ExtractDeps,
): Promise<Result<ExtractedDocument>> => {
  const startedAt = deps.now();
  const attempted = await attempt(input, deps);
  logEvent({
    event: "extraction",
    filename: input.filename,
    kind: attempted.kind,
    inputMode: attempted.inputMode,
    attempts: attempted.attempts,
    inputTokens: attempted.usage.inputTokens,
    outputTokens: attempted.usage.outputTokens,
    ms: deps.now() - startedAt,
    outcome: attempted.outcome,
  });
  return attempted.result;
};
