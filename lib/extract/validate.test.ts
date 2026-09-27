import type { ContentBlock } from "@anthropic-ai/sdk/resources/messages";
import { describe, expect, it } from "vitest";
import { fakeMessage, fixtureCall } from "./testing";
import { validateToolCall } from "./validate";

const toolBlock = (name: string, input: unknown, id = "toolu_1") =>
  ({ type: "tool_use", id, name, input }) as ContentBlock;

const textBlock = (text: string) =>
  ({ type: "text", text, citations: null }) as ContentBlock;

describe("validateToolCall, classification (AC-3)", () => {
  it("returns the kind and the tool input for a record that converts", () => {
    const call = fixtureCall("PO-4501.pdf");
    const result = validateToolCall(
      fakeMessage([toolBlock(call.name, call.input)]),
      "PO-4501.pdf",
    );
    expect(result).toEqual({
      ok: true,
      value: { kind: "purchase_order", extraction: call.input },
    });
  });

  it("finds the tool call after a text block", () => {
    const call = fixtureCall("C-2026-022.pdf");
    const result = validateToolCall(
      fakeMessage([
        textBlock("Recording it."),
        toolBlock(call.name, call.input),
      ]),
      "C-2026-022.pdf",
    );
    expect(result).toMatchObject({ ok: true, value: { kind: "contract" } });
  });
});

describe("validateToolCall, invalid input earns a repair (AC-4)", () => {
  it("names an unknown tool and keeps its id for the tool result", () => {
    const result = validateToolCall(
      fakeMessage([toolBlock("record_receipt", {}, "toolu_9")]),
      "x.pdf",
    );
    expect(result).toEqual({
      ok: false,
      error: {
        type: "invalid",
        reason: "unknown tool record_receipt",
        toolUseId: "toolu_9",
      },
    });
  });

  it("marks input the converter rejects as invalid, not as another failure", () => {
    const result = validateToolCall(
      fakeMessage([toolBlock("record_invoice", { invoiceNumber: 42 })]),
      "x.pdf",
    );
    expect(result).toMatchObject({
      ok: false,
      error: { type: "invalid", toolUseId: "toolu_1" },
    });
  });

  it("marks a contract shaped input sent to the invoice tool as invalid", () => {
    const contract = fixtureCall("C-2026-014.pdf");
    const result = validateToolCall(
      fakeMessage([toolBlock("record_invoice", contract.input)]),
      "C-2026-014.pdf",
    );
    expect(result).toMatchObject({ ok: false, error: { type: "invalid" } });
  });
});

describe("validateToolCall, rejection (AC-5)", () => {
  it("returns the model's reason, trimmed", () => {
    const result = validateToolCall(
      fakeMessage([
        toolBlock("reject_document", { reason: "  a delivery note  " }),
      ]),
      "x.pdf",
    );
    expect(result).toEqual({
      ok: false,
      error: { type: "rejected", reason: "a delivery note" },
    });
  });

  it.each([
    ["a blank reason", { reason: "   " }],
    ["no reason field", {}],
    ["a reason that is not text", { reason: 7 }],
    ["no input at all", null],
  ])("says no reason given for %s", (_, input) => {
    const result = validateToolCall(
      fakeMessage([toolBlock("reject_document", input)]),
      "x.pdf",
    );
    expect(result).toEqual({
      ok: false,
      error: { type: "rejected", reason: "no reason given" },
    });
  });
});

describe("validateToolCall, stops (AC-6)", () => {
  const call = fixtureCall("NL-88121.pdf");

  it("treats a refusal as refused even when a tool call is present", () => {
    const result = validateToolCall(
      fakeMessage([toolBlock(call.name, call.input)], "refusal"),
      "NL-88121.pdf",
    );
    expect(result).toMatchObject({ ok: false, error: { type: "refused" } });
  });

  it("treats max_tokens as cut off even when a tool call is present", () => {
    const result = validateToolCall(
      fakeMessage([toolBlock(call.name, call.input)], "max_tokens"),
      "NL-88121.pdf",
    );
    expect(result).toEqual({
      ok: false,
      error: { type: "cut_off", reason: "output cut off at max_tokens" },
    });
  });

  it.each([
    ["a text only reply", [textBlock("This is an invoice.")]],
    ["an empty reply", []],
  ])("reports no tool for %s", (_, content) => {
    const result = validateToolCall(fakeMessage(content, "end_turn"), "x.pdf");
    expect(result).toMatchObject({ ok: false, error: { type: "no_tool" } });
  });
});
