import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type {
  ContentBlock,
  Message,
  MessageCreateParamsNonStreaming,
  StopReason,
} from "@anthropic-ai/sdk/resources/messages";
import { BRIEF_SAMPLE } from "@/lib/schemas/fixtures/brief-sample";
import type { ExtractDeps } from "./extract";
import { readPdf } from "./pdf";
import { buildRequest, type DocumentContent } from "./request";
import { RECORD_TOOL } from "./tools";

/** Test support: sample bytes, fixture tool calls and a fake client. Not imported by app code. */

const SAMPLE_DIR = fileURLToPath(
  new URL("../../public/sample/", import.meta.url),
);

export const readSample = async (filename: string): Promise<Uint8Array> =>
  new Uint8Array(await readFile(`${SAMPLE_DIR}${filename}`));

export type FixtureCall = { readonly name: string; readonly input: unknown };

/** Every sample PDF's fixture extraction, as the tool call that would record it. */
export const FIXTURE_CALLS: ReadonlyMap<string, FixtureCall> = new Map<
  string,
  FixtureCall
>([
  ...BRIEF_SAMPLE.contracts.map(
    (doc) =>
      [
        doc.filename,
        { name: RECORD_TOOL.contract, input: doc.extraction },
      ] as const,
  ),
  ...BRIEF_SAMPLE.purchaseOrders.map(
    (doc) =>
      [
        doc.filename,
        { name: RECORD_TOOL.purchase_order, input: doc.extraction },
      ] as const,
  ),
  ...BRIEF_SAMPLE.invoices.map(
    (doc) =>
      [
        doc.filename,
        { name: RECORD_TOOL.invoice, input: doc.extraction },
      ] as const,
  ),
]);

export const fixtureCall = (filename: string): FixtureCall => {
  const found = FIXTURE_CALLS.get(filename);
  if (!found) throw new Error(`no fixture for ${filename}`);
  return found;
};

export const fakeMessage = (
  content: readonly ContentBlock[],
  stopReason: StopReason = "tool_use",
): Message =>
  ({
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-5",
    content,
    stop_reason: stopReason,
    stop_sequence: null,
    usage: { input_tokens: 1000, output_tokens: 200 },
  }) as unknown as Message;

export const toolUse = (call: FixtureCall, id = "toolu_1"): Message =>
  fakeMessage([
    {
      type: "tool_use",
      id,
      name: call.name,
      input: call.input,
    } as ContentBlock,
  ]);

/** A fake client that answers from a script of responses (or throws) and records each request. */
export const fakeDeps = (
  script: readonly (Message | Error)[],
  apiKeySet = true,
): ExtractDeps & {
  readonly requests: readonly MessageCreateParamsNonStreaming[];
} => {
  const requests: MessageCreateParamsNonStreaming[] = [];
  return {
    requests,
    apiKeySet,
    now: () => 0,
    createMessage: async (params) => {
      const next = script[requests.length];
      requests.push(structuredClone(params));
      if (next === undefined)
        throw new Error("the fake client ran out of answers");
      if (next instanceof Error) throw next;
      return next;
    },
  };
};

const firstBlockKey = (params: MessageCreateParamsNonStreaming): string => {
  const [first] = params.messages;
  return JSON.stringify(Array.isArray(first.content) ? first.content[0] : null);
};

/**
 * A fake client that answers each sample PDF with its fixture tool call, whatever order the calls
 * come in: it recognizes a document by its first content block. `answers` overrides a file with a
 * script of responses (or errors), one per call.
 */
export const fixtureClient = async (
  answers: ReadonlyMap<string, readonly (Message | Error)[]> = new Map(),
): Promise<ExtractDeps & { readonly calls: () => number }> => {
  const keys = new Map(
    await Promise.all(
      [...FIXTURE_CALLS.keys()].map(async (filename) => {
        const pdf = await readPdf(await readSample(filename));
        if (!pdf.ok) throw new Error(`${filename}: ${pdf.error}`);
        const bytes = await readSample(filename);
        const content: DocumentContent = pdf.value.hasTextLayer
          ? { mode: "text", pages: pdf.value.pages }
          : { mode: "pdf", base64: Buffer.from(bytes).toString("base64") };
        return [
          firstBlockKey(buildRequest("model", content)),
          filename,
        ] as const;
      }),
    ),
  );
  const seen = new Map<string, number>();
  const counter = { calls: 0 };
  return {
    apiKeySet: true,
    now: () => 0,
    calls: () => counter.calls,
    createMessage: async (params) => {
      counter.calls += 1;
      const filename = keys.get(firstBlockKey(params));
      if (filename === undefined) throw new Error("unknown document");
      const turn = seen.get(filename) ?? 0;
      seen.set(filename, turn + 1);
      const scripted = answers.get(filename)?.[turn];
      if (scripted instanceof Error) throw scripted;
      return scripted ?? toolUse(fixtureCall(filename));
    },
  };
};
