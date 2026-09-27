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
