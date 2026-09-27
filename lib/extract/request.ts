import "server-only";
import type {
  ContentBlockParam,
  Message,
  MessageCreateParamsNonStreaming,
  MessageParam,
} from "@anthropic-ai/sdk/resources/messages";
import { SYSTEM_PROMPT } from "./prompt";
import { toolsFor } from "./tools";

/** Room for the largest sample document's tool input with margin (spec 0005). */
export const EXTRACT_MAX_TOKENS = 8192;

export const INSTRUCTION = "Record this document with exactly one tool.";

/** What the model reads: the page marked text, or the PDF itself for a scan (AC-2). */
export type DocumentContent =
  | { readonly mode: "text"; readonly pages: readonly string[] }
  | { readonly mode: "pdf"; readonly base64: string };

/** The first answer and why it failed validation, for the one repair turn (AC-4). */
export type Repair = {
  readonly response: Message;
  readonly toolUseId: string;
  readonly reason: string;
};

const pageMarked = (pages: readonly string[]): string =>
  pages.map((text, index) => `--- page ${index + 1} ---\n${text}`).join("\n");

const documentBlock = (content: DocumentContent): ContentBlockParam =>
  content.mode === "text"
    ? {
        type: "text",
        text: `<document>\n${pageMarked(content.pages)}\n</document>`,
      }
    : {
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: content.base64,
        },
      };

const repairMessages = (repair: Repair): readonly MessageParam[] => [
  { role: "assistant", content: repair.response.content },
  {
    role: "user",
    content: [
      {
        type: "tool_result",
        tool_use_id: repair.toolUseId,
        is_error: true,
        content: `Validation failed: ${repair.reason}. Call the tool again with corrected values copied from the document.`,
      },
    ],
  },
];

/** The request for one document; with `repair`, the repair turn that follows it. Pure. */
export const buildRequest = (
  model: string,
  content: DocumentContent,
  repair?: Repair,
): MessageCreateParamsNonStreaming => ({
  model,
  max_tokens: EXTRACT_MAX_TOKENS,
  thinking: { type: "disabled" },
  tool_choice: { type: "any", disable_parallel_tool_use: true },
  system: [
    { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
  ],
  tools: [...toolsFor()],
  messages: [
    {
      role: "user",
      content: [documentBlock(content), { type: "text", text: INSTRUCTION }],
    },
    ...(repair ? repairMessages(repair) : []),
  ],
});
