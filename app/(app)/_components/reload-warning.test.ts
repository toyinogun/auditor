import { describe, expect, it } from "vitest";
import { reloadWarning } from "./reload-warning";

describe("reloadWarning (spec 0007, AC-13)", () => {
  it("names one saved decision in the singular", () => {
    expect(reloadWarning(1)).toBe(
      "This clears 1 saved decision (an approval or rejection) and starts a fresh audit.",
    );
  });

  it("names more than one in the plural", () => {
    expect(reloadWarning(2)).toBe(
      "This clears 2 saved decisions (approvals and rejections) and starts a fresh audit.",
    );
  });
});
