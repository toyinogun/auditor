import { APIError } from "@anthropic-ai/sdk";
import type {
  ContentBlock,
  Message,
  MessageCreateParamsNonStreaming,
} from "@anthropic-ai/sdk/resources/messages";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { logEvent } from "@/lib/log";
import { BRIEF_SAMPLE } from "@/lib/schemas/fixtures/brief-sample";
import { SAMPLE_MANIFEST_FILE_COUNT } from "@/lib/schemas/sample-manifest";
import { extractDocument } from "./extract";
import {
  FIXTURE_CALLS,
  fakeDeps,
  fakeMessage,
  fixtureCall,
  readSample,
  toolUse,
} from "./testing";
import { REJECT_TOOL } from "./tools";

vi.mock("@/lib/log", () => ({ logEvent: vi.fn() }));

const logged = () => vi.mocked(logEvent).mock.calls.map(([event]) => event);

beforeEach(() => vi.mocked(logEvent).mockClear());

const lastUserBlocks = (params: MessageCreateParamsNonStreaming) => {
  const last = params.messages[params.messages.length - 1];
  return Array.isArray(last.content) ? last.content : [];
};

const firstUserBlocks = (params: MessageCreateParamsNonStreaming) => {
  const first = params.messages[0];
  return Array.isArray(first.content) ? first.content : [];
};

const extractSample = async (
  filename: string,
  script: readonly (Message | Error)[] = [toolUse(fixtureCall(filename))],
) => {
  const deps = fakeDeps(script);
  const result = await extractDocument(
    { filename, bytes: await readSample(filename) },
    deps,
  );
  return { result, deps };
};

describe("extractDocument, happy path (AC-1, AC-3)", () => {
  it("covers the 12 sample PDFs", () => {
    expect(FIXTURE_CALLS.size).toBe(SAMPLE_MANIFEST_FILE_COUNT - 2);
  });

  it.each([...FIXTURE_CALLS.keys()])(
    "classifies and extracts %s in one call",
    async (filename) => {
      const { result, deps } = await extractSample(filename);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.attempts).toBe(1);
      expect(result.value.extraction).toEqual(fixtureCall(filename).input);
      expect(result.value.usage).toEqual({
        inputTokens: 1000,
        outputTokens: 200,
      });
      expect(deps.requests).toHaveLength(1);
    },
  );

  it("sets the kind from the tool", async () => {
    const kinds = await Promise.all(
      ["C-2026-014.pdf", "PO-4501.pdf", "BW-5521.pdf"].map(async (name) => {
        const { result } = await extractSample(name);
        return result.ok ? result.value.kind : null;
      }),
    );
    expect(kinds).toEqual(["contract", "purchase_order", "invoice"]);
  });

  it("sends forced tool choice, thinking off, 4 strict tools and no filename", async () => {
    const { deps } = await extractSample("NL-88121.pdf");
    const [request] = deps.requests;
    expect(request.tool_choice).toEqual({
      type: "any",
      disable_parallel_tool_use: true,
    });
    expect(request.thinking).toEqual({ type: "disabled" });
    expect(request.model).toBe("claude-sonnet-5");
    expect(request.tools).toHaveLength(4);
    expect(
      request.tools?.every((tool) => "strict" in tool && tool.strict),
    ).toBe(true);
    expect(JSON.stringify(request.messages)).not.toContain("NL-88121.pdf");
  });

  it("sends a text PDF as page marked text inside document tags (AC-2)", async () => {
    const { result, deps } = await extractSample("NL-88121.pdf");
    const [block] = firstUserBlocks(deps.requests[0]);
    expect(block).toMatchObject({ type: "text" });
    const text = block.type === "text" ? block.text : "";
    expect(text.startsWith("<document>\n--- page 1 ---\n")).toBe(true);
    expect(text.endsWith("</document>")).toBe(true);
    expect(result).toMatchObject({ ok: true, value: { hasTextLayer: true } });
  });

  it("sends the scan as a PDF document block (AC-2, AC-11)", async () => {
    const bytes = await readSample("NL88310.pdf");
    const { result, deps } = await extractSample("NL88310.pdf");
    const [block] = firstUserBlocks(deps.requests[0]);
    expect(block).toEqual({
      type: "document",
      source: {
        type: "base64",
        media_type: "application/pdf",
        data: Buffer.from(bytes).toString("base64"),
      },
    });
    expect(result).toMatchObject({
      ok: true,
      value: { kind: "invoice", hasTextLayer: false },
    });
  });
});

const OVERLOADED = new APIError(
  529,
  { type: "error" },
  "Overloaded",
  new Headers(),
);

const NL_88203 = BRIEF_SAMPLE.invoices[1];

const badLineAmount = toolUse(
  {
    name: "record_invoice",
    input: {
      ...NL_88203.extraction,
      lines: [
        { ...NL_88203.extraction.lines[0], amount: "4800.00" },
        ...NL_88203.extraction.lines.slice(1),
      ],
    },
  },
  "toolu_bad",
);

describe("extractDocument, repair once (AC-4)", () => {
  it("passes on the repair turn with attempts 2", async () => {
    const { result, deps } = await extractSample("NL-88203.pdf", [
      badLineAmount,
      toolUse(fixtureCall("NL-88203.pdf"), "toolu_good"),
    ]);
    expect(result).toMatchObject({ ok: true, value: { attempts: 2 } });
    expect(result.ok && result.value.usage).toEqual({
      inputTokens: 2000,
      outputTokens: 400,
    });

    const repair = deps.requests[1];
    expect(repair.messages).toHaveLength(3);
    expect(repair.messages[1]).toEqual({
      role: "assistant",
      content: badLineAmount.content,
    });
    const [toolResult] = lastUserBlocks(repair);
    expect(toolResult).toMatchObject({
      type: "tool_result",
      tool_use_id: "toolu_bad",
      is_error: true,
    });
    expect(JSON.stringify(toolResult)).toContain("line 1");
  });

  it("fails after 2 attempts when the repair is also wrong", async () => {
    const { result, deps } = await extractSample("NL-88203.pdf", [
      badLineAmount,
      badLineAmount,
    ]);
    expect(deps.requests).toHaveLength(2);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("NL-88203.pdf");
    expect(result.error).toContain("line 1");
    expect(result.error).toContain("after 2 attempts");
    expect(logged()[0]).toMatchObject({ outcome: "invalid", attempts: 2 });
  });

  it("fails as an API error when the repair call itself fails", async () => {
    const { result, deps } = await extractSample("NL-88203.pdf", [
      badLineAmount,
      OVERLOADED,
    ]);
    expect(deps.requests).toHaveLength(2);
    expect(result).toEqual({ ok: false, error: "API error: HTTP 529" });
    expect(logged()).toEqual([
      expect.objectContaining({
        outcome: "api_error",
        attempts: 2,
        inputMode: "text",
        inputTokens: 1000,
        outputTokens: 200,
      }),
    ]);
  });
});

const REFUSAL = fakeMessage([], "refusal");
const CUT_OFF = fakeMessage(
  [{ type: "text", text: "partial" } as ContentBlock],
  "max_tokens",
);
const TEXT_ONLY = fakeMessage(
  [{ type: "text", text: "This is an invoice." } as ContentBlock],
  "end_turn",
);

describe("extractDocument, no repair (AC-5, AC-6)", () => {
  it("returns a rejection with the model's reason", async () => {
    const { result, deps } = await extractSample("NL-88121.pdf", [
      toolUse({ name: REJECT_TOOL, input: { reason: "It is a menu." } }),
    ]);
    expect(deps.requests).toHaveLength(1);
    expect(result).toEqual({
      ok: false,
      error:
        "NL-88121.pdf: not an invoice, contract or purchase order: It is a menu.",
    });
  });

  it.each([
    ["a refusal", REFUSAL, "refused", "refused"],
    ["max_tokens", CUT_OFF, "output cut off at max_tokens", "cut_off"],
    ["a text only reply", TEXT_ONLY, "no tool", "invalid"],
    ["an API error", OVERLOADED, "HTTP 529", "api_error"],
  ])("fails %s after exactly one call", async (_, answer, reason, outcome) => {
    const { result, deps } = await extractSample("NL-88121.pdf", [answer]);
    expect(deps.requests).toHaveLength(1);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain(reason);
    expect(logged()[0]).toMatchObject({ outcome, attempts: 1 });
  });

  it("fails with zero calls when the key is not set", async () => {
    const deps = fakeDeps([], false);
    const result = await extractDocument(
      { filename: "NL-88121.pdf", bytes: await readSample("NL-88121.pdf") },
      deps,
    );
    expect(result).toEqual({
      ok: false,
      error: "ANTHROPIC_API_KEY is not set",
    });
    expect(deps.requests).toHaveLength(0);
    expect(logged()).toEqual([
      expect.objectContaining({
        outcome: "api_error",
        attempts: 0,
        inputMode: "text",
        inputTokens: 0,
        outputTokens: 0,
      }),
    ]);
  });

  it("throws for an error that is not an API error (a bug)", async () => {
    await expect(
      extractSample("NL-88121.pdf", [new TypeError("boom")]),
    ).rejects.toThrow("boom");
  });
});

describe("extractDocument, input guards (AC-7)", () => {
  it.each([
    ["random bytes", new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]), "not a PDF"],
    [
      "a truncated PDF",
      new TextEncoder().encode("%PDF-1.7\n1 0 obj\n<<"),
      "could not read the PDF",
    ],
  ])("fails %s with zero calls", async (_, bytes, error) => {
    const deps = fakeDeps([]);
    const result = await extractDocument({ filename: "x.pdf", bytes }, deps);
    expect(result).toEqual({ ok: false, error });
    expect(deps.requests).toHaveLength(0);
    expect(logged()[0]).toMatchObject({
      outcome: "bad_input",
      attempts: 0,
      kind: null,
      inputMode: null,
    });
  });
});

describe("extractDocument, logging (AC-12)", () => {
  it("logs one line with counts only, never values", async () => {
    await extractSample("NL-88121.pdf");
    expect(logged()).toEqual([
      {
        event: "extraction",
        filename: "NL-88121.pdf",
        kind: "invoice",
        inputMode: "text",
        attempts: 1,
        inputTokens: 1000,
        outputTokens: 200,
        ms: 0,
        outcome: "ok",
      },
    ]);
  });

  it("never logs the failure reason or extracted values", async () => {
    await extractSample("NL-88203.pdf", [badLineAmount, badLineAmount]);
    const line = JSON.stringify(logged());
    expect(line).not.toContain("line 1");
    expect(line).not.toContain("4800");
    expect(line).not.toContain("Northline");
  });

  it("logs the scan's input mode as pdf", async () => {
    await extractSample("NL88310.pdf");
    expect(logged()[0]).toMatchObject({ inputMode: "pdf", outcome: "ok" });
  });
});
