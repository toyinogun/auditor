import { describe, expect, it } from "vitest";
import { err, ok, orThrow } from "./result";

describe("orThrow", () => {
  it("returns the value of an ok result", () => {
    expect(orThrow("sample", ok(42))).toBe(42);
  });

  it("throws with the context and the reason for an error result", () => {
    expect(() => orThrow("C-2026-014.pdf", err("price: not a number"))).toThrow(
      "C-2026-014.pdf: price: not a number",
    );
  });
});
