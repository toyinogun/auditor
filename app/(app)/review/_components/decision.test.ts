import { describe, expect, it } from "vitest";
import {
  findingHref,
  REASON_REQUIRED,
  reasonProblem,
  STALE_FINDING,
} from "./decision";

describe("findingHref (spec 0008, AC-2, AC-3)", () => {
  it("puts the finding key in the finding search param, encoded", () => {
    expect(findingHref("duplicate:northline industrial supply:NL88310:-")).toBe(
      "/review?finding=duplicate%3Anorthline%20industrial%20supply%3ANL88310%3A-",
    );
  });
});

describe("reasonProblem (spec 0008, AC-9)", () => {
  it.each(["", "   ", "\n\t"])("refuses the blank reason %j", (reason) => {
    expect(reasonProblem(reason)).toBe(REASON_REQUIRED);
  });

  it("accepts a real reason", () => {
    expect(reasonProblem("Credit note CN-12 issued")).toBeNull();
  });

  it("uses the spec's copy", () => {
    expect(REASON_REQUIRED).toBe("Enter a reason to reject this finding.");
    expect(STALE_FINDING).toBe(
      "This finding changed since the page loaded. The list has been refreshed.",
    );
  });
});
