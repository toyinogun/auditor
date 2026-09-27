import { describe, expect, it } from "vitest";
import { formatCents, parseMoney, parseRate, percentOfCents } from "./money";

describe("parseMoney", () => {
  it.each([
    ["5.10", 510],
    ["5.1", 510],
    ["5", 500],
    ["0.92", 92],
    ["15600.50", 1560050],
    ["0", 0],
    ["999999999.99", 99999999999],
  ])("reads %s as %i cents", (text, cents) => {
    expect(parseMoney(text, "unitPrice")).toEqual({ ok: true, value: cents });
  });

  it.each([
    "5.105",
    "1,500.00",
    "-3.00",
    "$5.10",
    "",
    " 5.10",
    "5.",
    ".5",
    "abc",
    "1e3",
  ])("rejects %j with a reason naming the field", (text) => {
    const result = parseMoney(text, "lines[0].unitPrice");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("lines[0].unitPrice");
  });
});

describe("parseRate", () => {
  it.each([
    ["2.5", 250],
    ["4", 400],
    ["3.0", 300],
    ["0.25", 25],
    ["100", 10000],
  ])("reads %s percent as %i basis points", (text, bps) => {
    expect(parseRate(text, "rate")).toEqual({ ok: true, value: bps });
  });

  it.each(["2.555", "-1", "2.5%", "1000", ""])(
    "rejects %j naming the field",
    (text) => {
      const result = parseRate(text, "charges[0].rate");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain("charges[0].rate");
    },
  );
});

describe("percentOfCents", () => {
  it("takes 2.5% of $7,650.00", () => {
    expect(percentOfCents(765000, 250)).toBe(19125);
  });

  it("rounds half away from zero to the cent", () => {
    expect(percentOfCents(1, 5000)).toBe(1);
    expect(percentOfCents(3, 5000)).toBe(2);
    expect(percentOfCents(-1, 5000)).toBe(-1);
  });

  it("rounds below half down", () => {
    expect(percentOfCents(1, 4999)).toBe(0);
  });

  it("matches the sample invoice charges", () => {
    expect(percentOfCents(1522000, 250)).toBe(38050);
    expect(percentOfCents(1064000, 250)).toBe(26600);
    expect(percentOfCents(765000, 400)).toBe(30600);
    expect(percentOfCents(1037000, 300)).toBe(31110);
  });
});

describe("formatCents", () => {
  it.each([
    [976685, "$9,766.85"],
    [0, "$0.00"],
    [5, "$0.05"],
    [485, "$4.85"],
    [5393960, "$53,939.60"],
    [100000000, "$1,000,000.00"],
    [-37500, "-$375.00"],
  ])("formats %i as %s", (cents, text) => {
    expect(formatCents(cents)).toBe(text);
  });
});
