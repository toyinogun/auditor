import { describe, expect, it } from "vitest";
import { csvField, toCsv } from "./csv";
import { exportTable } from "./table";
import { exportFinding, exportSnapshot } from "./testing";

const NOW = Date.UTC(2026, 8, 27, 14, 5);
const BOM = "﻿";
const HEADER =
  "Supplier,Invoice,Check,Action,Finding,Amount (USD),Calculation,Evidence,Decision,Reason,Decided at (UTC)";

const lines = (csv: string): string[] => csv.slice(BOM.length).split("\r\n");

describe("csvField (spec 0009, AC-11)", () => {
  it.each([
    ["plain", "plain"],
    ["a, b", '"a, b"'],
    ['say "hi"', '"say ""hi"""'],
    ["two\nlines", '"two\nlines"'],
    ["cr\rhere", '"cr\rhere"'],
    ["", ""],
  ])("quotes %j as %j", (value, field) => {
    expect(csvField({ kind: "text", value })).toBe(field);
  });

  it.each([
    ['=HYPERLINK("x")', `"'=HYPERLINK(""x"")"`],
    ["-1+1", "'-1+1"],
    ["+1", "'+1"],
    ["@SUM(A1)", "'@SUM(A1)"],
    ["\tcmd", "'\tcmd"],
    ["\rcmd", `"'\rcmd"`],
  ])("guards the formula %j as %j", (value, field) => {
    expect(csvField({ kind: "text", value })).toBe(field);
  });

  it("writes money as a plain decimal, never guarded", () => {
    expect(csvField({ kind: "money", cents: 814_100 })).toBe("8141.00");
    expect(csvField({ kind: "money", cents: 5 })).toBe("0.05");
  });

  it("writes an empty cell as nothing", () => {
    expect(csvField({ kind: "empty" })).toBe("");
  });

  it("writes a count as bare digits", () => {
    expect(csvField({ kind: "count", value: 10 })).toBe("10");
    expect(csvField({ kind: "count", value: 0 })).toBe("0");
  });
});

describe("toCsv (spec 0009, AC-8, AC-11)", () => {
  it("starts with a BOM and ends every line with CRLF", () => {
    const csv = toCsv(exportTable(exportSnapshot([exportFinding()]), NOW));
    expect(csv.startsWith(BOM)).toBe(true);
    expect(csv.endsWith("\r\n")).toBe(true);
    expect(csv.replaceAll("\r\n", "")).not.toMatch(/[\r\n]/);
  });

  it("writes the header, the rows, one blank row, then the two totals", () => {
    const csv = toCsv(exportTable(exportSnapshot([exportFinding()]), NOW));
    expect(lines(csv)).toEqual([
      HEADER,
      'Northline Industrial,NL88310,Duplicate invoice,Recover,Duplicate of NL88301,8141.00,"Same supplier, total and lines as NL88301","NL88310.pdf, header · NL88301.pdf, header",Pending,,',
      "",
      "Total recoverable,,,,,9766.85,,,,,",
      "Total approved,,,,,0.00,,,,,",
      "",
    ]);
  });

  it("keeps the blank row with no findings", () => {
    const csv = toCsv(
      exportTable(
        exportSnapshot([], {
          headline: { recoverableCents: 0, recoverableShare: "0.0%" },
        }),
        NOW,
      ),
    );
    expect(lines(csv)).toEqual([
      HEADER,
      "",
      "Total recoverable,,,,,0.00,,,,,",
      "Total approved,,,,,0.00,,,,,",
      "",
    ]);
  });
});
