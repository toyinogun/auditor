import { describe, expect, it } from "vitest";
import { parseCsv, toCsv, toCsvRows } from "./csv";

describe("toCsv", () => {
  it("writes LF lines with a trailing newline and no quoting for plain cells", () => {
    expect(toCsv(["a", "b"], [["1", "2"]])).toBe("a,b\n1,2\n");
  });

  it("quotes only cells with a comma, quote or newline", () => {
    expect(toCsv(["x"], [["Acme, Inc."], ['say "hi"'], ["two\nlines"]])).toBe(
      'x\n"Acme, Inc."\n"say ""hi"""\n"two\nlines"\n',
    );
  });

  it("has no byte order mark", () => {
    expect(toCsv(["a"], []).charCodeAt(0)).toBe("a".charCodeAt(0));
  });
});

describe("toCsvRows", () => {
  it("orders cells by the header", () => {
    expect(toCsvRows(["b", "a"], [{ a: "1", b: "2" }])).toEqual([["2", "1"]]);
  });
});

describe("parseCsv", () => {
  it("reads back what toCsv wrote", () => {
    const rows = [
      ["Acme, Inc.", 'say "hi"'],
      ["plain", "two\nlines"],
    ];
    expect(parseCsv(toCsv(["a", "b"], rows))).toEqual({
      header: ["a", "b"],
      rows,
    });
  });
});
