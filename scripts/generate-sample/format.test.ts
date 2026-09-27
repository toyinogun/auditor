import { describe, expect, it } from "vitest";
import {
  addDays,
  dueDate,
  formatLongDate,
  formatMoney,
  formatQuantity,
  infoDate,
} from "./format";

describe("formatLongDate", () => {
  it.each([
    ["2026-04-03", "April 3, 2026"],
    ["2026-01-30", "January 30, 2026"],
    ["2026-12-31", "December 31, 2026"],
  ])("prints %s as %s", (iso, printed) => {
    expect(formatLongDate(iso)).toBe(printed);
  });

  it("throws on a date that is not real", () => {
    expect(() => formatLongDate("2026-02-30")).toThrow("2026-02-30");
  });
});

describe("dueDate", () => {
  it("is 30 days after the invoice date (NL-88310 is due May 3, 2026)", () => {
    expect(dueDate("2026-04-03")).toBe("2026-05-03");
  });

  it("crosses month and year ends in UTC", () => {
    expect(dueDate("2026-01-30")).toBe("2026-03-01");
    expect(addDays("2026-12-15", 30)).toBe("2027-01-14");
  });
});

describe("infoDate", () => {
  it("is noon UTC on the document date", () => {
    expect(infoDate("2026-04-03").toISOString()).toBe(
      "2026-04-03T12:00:00.000Z",
    );
  });
});

describe("formatQuantity", () => {
  it.each([
    [150, "150"],
    [2000, "2,000"],
    [1234567, "1,234,567"],
  ])("groups %i as %s", (quantity, printed) => {
    expect(formatQuantity(quantity)).toBe(printed);
  });
});

describe("formatMoney", () => {
  it.each([
    ["15600.50", "$15,600.50"],
    ["0.92", "$0.92"],
    ["4.85", "$4.85"],
  ])("prints %s as %s", (text, printed) => {
    expect(formatMoney(text)).toBe(printed);
  });

  it("throws on text that is not plain money", () => {
    expect(() => formatMoney("1,500.00")).toThrow();
  });
});
