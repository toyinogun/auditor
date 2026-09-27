import { describe, expect, it } from "vitest";
import {
  alertShows,
  findingHref,
  NOT_SAVED,
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
      "The finding you chose changed since the page loaded. Nothing was saved, and the list has been refreshed.",
    );
  });
});

describe("alertShows (spec 0008, AC-12)", () => {
  const gone = "freight:northline industrial supply:NL-88310:freight";
  const first = "duplicate:northline industrial supply:NL88310:-";
  const stale = { text: STALE_FINDING, raisedFor: gone, stale: true };

  it("keeps the stale alert while the URL still names the missing finding", () => {
    expect(alertShows(stale, { findingKey: first, findingParam: gone })).toBe(
      true,
    );
  });

  it("drops the stale alert once another finding is picked", () => {
    expect(alertShows(stale, { findingKey: first, findingParam: first })).toBe(
      false,
    );
    expect(alertShows(stale, { findingKey: first, findingParam: null })).toBe(
      false,
    );
  });

  it("shows any other alert only on the finding it was raised for", () => {
    const failed = { text: NOT_SAVED, raisedFor: first, stale: false };
    expect(alertShows(failed, { findingKey: first, findingParam: first })).toBe(
      true,
    );
    expect(alertShows(failed, { findingKey: gone, findingParam: gone })).toBe(
      false,
    );
  });

  it("shows nothing without an alert", () => {
    expect(alertShows(null, { findingKey: first, findingParam: null })).toBe(
      false,
    );
  });
});
