import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BRIEF_SAMPLE } from "@/lib/schemas/fixtures/brief-sample";
import { parseCsv, parsePaymentsCsv, parseReceiptsCsv } from "./csv";

const sampleText = (filename: string): Promise<string> =>
  readFile(
    fileURLToPath(new URL(`../../public/sample/${filename}`, import.meta.url)),
    "utf8",
  );

describe("parseCsv", () => {
  it("reads quoted cells with commas, quotes and newlines", () => {
    expect(
      parseCsv('a,b\n"Acme, Inc.","say ""hi"""\nplain,"two\nlines"\n'),
    ).toEqual({
      header: ["a", "b"],
      rows: [
        ["Acme, Inc.", 'say "hi"'],
        ["plain", "two\nlines"],
      ],
    });
  });

  it("accepts CRLF line endings and a missing final newline", () => {
    expect(parseCsv("a,b\r\n1,2\r\n3,4")).toEqual({
      header: ["a", "b"],
      rows: [
        ["1", "2"],
        ["3", "4"],
      ],
    });
  });
});

describe("parseReceiptsCsv and parsePaymentsCsv (AC-8)", () => {
  it("parse the committed sample CSVs to the fixture rows", async () => {
    expect(parseReceiptsCsv(await sampleText("receipts.csv"))).toEqual({
      ok: true,
      value: BRIEF_SAMPLE.receipts.rows,
    });
    expect(parsePaymentsCsv(await sampleText("ap_payments.csv"))).toEqual({
      ok: true,
      value: BRIEF_SAMPLE.payments.rows,
    });
  });

  it("names the first column that differs", () => {
    expect(
      parseReceiptsCsv("po_number,SKU,quantity_received,received_date\n"),
    ).toEqual({ ok: false, error: "column 2: expected sku, found SKU" });
  });

  it("names a missing column by count", () => {
    expect(parseReceiptsCsv("po_number,sku,quantity_received\n")).toEqual({
      ok: false,
      error: "expected 4 columns, found 3",
    });
  });

  it("names an extra column by count", () => {
    expect(
      parsePaymentsCsv(
        "invoice_number,supplier,amount,paid_date,reference,note\n",
      ),
    ).toEqual({ ok: false, error: "expected 5 columns, found 6" });
  });

  it("names a missing sku column by the position it shifts", () => {
    expect(
      parseReceiptsCsv("po_number,quantity_received,received_date\n"),
    ).toEqual({
      ok: false,
      error: "column 2: expected sku, found quantity_received",
    });
  });

  it("names a short row", () => {
    expect(
      parseReceiptsCsv(
        "po_number,sku,quantity_received,received_date\n" +
          "PO-4501,NL-BRG-6204,2000,2026-01-26\n" +
          "PO-4501,NL-SHF-2012,300\n",
      ),
    ).toEqual({ ok: false, error: "row 2: expected 4 cells, found 3" });
  });

  it("reads a header only file as no rows", () => {
    expect(
      parsePaymentsCsv("invoice_number,supplier,amount,paid_date,reference\n"),
    ).toEqual({ ok: true, value: [] });
  });

  it("refuses an empty file", () => {
    expect(parseReceiptsCsv("")).toEqual({
      ok: false,
      error: "expected 4 columns, found 0",
    });
  });
});
