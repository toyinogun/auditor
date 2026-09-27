import { describe, expect, it } from "vitest";
import { centsToPlain, exportFileName, utcMinute } from "./format";

describe("centsToPlain (spec 0009, AC-7)", () => {
  it.each([
    [0, "0.00"],
    [5, "0.05"],
    [100, "1.00"],
    [814_100, "8141.00"],
    [976_685, "9766.85"],
    [123_456_789, "1234567.89"],
  ])("writes %i cents as %s", (cents, text) => {
    expect(centsToPlain(cents)).toBe(text);
  });

  it("keeps the sign on a negative amount", () => {
    expect(centsToPlain(-5)).toBe("-0.05");
  });
});

describe("utcMinute (spec 0009, AC-6)", () => {
  it("writes epoch ms as a UTC minute", () => {
    expect(utcMinute(Date.UTC(2026, 8, 27, 14, 5, 59, 999))).toBe(
      "2026-09-27 14:05",
    );
  });

  it("uses UTC, not the local day", () => {
    expect(utcMinute(Date.UTC(2026, 11, 31, 23, 59))).toBe("2026-12-31 23:59");
  });
});

describe("exportFileName (spec 0009, AC-10)", () => {
  const now = Date.UTC(2026, 8, 27, 23, 30);

  it("names the file after the request's UTC date", () => {
    expect(exportFileName("xlsx", now)).toBe(
      "overpayment-findings-2026-09-27.xlsx",
    );
    expect(exportFileName("csv", now)).toBe(
      "overpayment-findings-2026-09-27.csv",
    );
  });
});
