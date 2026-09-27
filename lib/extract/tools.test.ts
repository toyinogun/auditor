import { describe, expect, it } from "vitest";
import { KIND_BY_TOOL, REJECT_TOOL, toolsFor, toStrictSchema } from "./tools";

type Node = { readonly [key: string]: unknown };

const isNode = (value: unknown): value is Node =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Every object node in a schema, at any depth. */
const objectNodes = (value: unknown): readonly Node[] => {
  if (Array.isArray(value)) return value.flatMap(objectNodes);
  if (!isNode(value)) return [];
  const children = Object.values(value).flatMap(objectNodes);
  return value.type === "object" ? [value, ...children] : children;
};

describe("toolsFor", () => {
  const tools = toolsFor();

  it("has the four tools in a fixed order, all strict", () => {
    expect(tools.map((tool) => tool.name)).toEqual([
      "record_invoice",
      "record_contract",
      "record_purchase_order",
      "reject_document",
    ]);
    expect(tools.every((tool) => tool.strict === true)).toBe(true);
  });

  it("makes every object node strict, nested ones included (AC-1)", () => {
    tools.forEach((tool) => {
      const nodes = objectNodes(tool.input_schema);
      expect(nodes.length).toBeGreaterThan(0);
      nodes.forEach((node) => {
        expect(node.additionalProperties).toBe(false);
        expect(node.required).toEqual(Object.keys(node.properties as Node));
      });
    });
  });

  it("reaches the items of lines, charges, prices and surcharges", () => {
    const itemNodes = tools.flatMap((tool) =>
      ["lines", "charges", "prices", "surcharges"].flatMap((key) => {
        const property = (tool.input_schema.properties as Node | undefined)?.[
          key
        ];
        return isNode(property) ? [property.items] : [];
      }),
    );
    expect(itemNodes).toHaveLength(5);
    itemNodes.forEach((items) =>
      expect(items).toMatchObject({ additionalProperties: false }),
    );
  });

  it("keeps nullable fields required so the model sends null", () => {
    const invoice = toolsFor()[0].input_schema;
    expect(invoice.required).toContain("poNumber");
  });

  it("drops keywords strict tools do not support", () => {
    const text = JSON.stringify(tools);
    expect(text).not.toContain("minLength");
    expect(text).not.toContain("$schema");
  });

  it("has a reject tool that takes a reason", () => {
    const reject = tools.find((tool) => tool.name === REJECT_TOOL);
    expect(reject?.input_schema.required).toEqual(["reason"]);
  });
});

describe("toStrictSchema", () => {
  it("adds required and additionalProperties at any depth", () => {
    const strict = toStrictSchema({
      type: "object",
      properties: {
        a: {
          type: "array",
          items: {
            type: "object",
            properties: {
              b: { anyOf: [{ type: "string" }, { type: "null" }] },
            },
          },
        },
      },
    });
    expect(objectNodes(strict)).toEqual([
      expect.objectContaining({ required: ["a"], additionalProperties: false }),
      expect.objectContaining({ required: ["b"], additionalProperties: false }),
    ]);
  });

  it("keeps minItems of 1 and drops larger ones", () => {
    const strict = toStrictSchema({
      type: "object",
      properties: {
        one: { type: "array", minItems: 1, items: { type: "string" } },
        two: { type: "array", minItems: 2, items: { type: "string" } },
      },
    });
    expect(strict.properties).toEqual({
      one: { type: "array", minItems: 1, items: { type: "string" } },
      two: { type: "array", items: { type: "string" } },
    });
  });
});

describe("KIND_BY_TOOL", () => {
  it("maps each record tool to its kind (AC-3)", () => {
    expect(KIND_BY_TOOL).toEqual({
      record_invoice: "invoice",
      record_contract: "contract",
      record_purchase_order: "purchase_order",
    });
  });
});
