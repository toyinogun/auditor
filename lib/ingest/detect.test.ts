import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { baseName, BYTES_PER_MB, detectFile } from "./detect";

const LIMIT = 10 * BYTES_PER_MB;

const sample = async (filename: string): Promise<Uint8Array> =>
  new Uint8Array(
    await readFile(
      fileURLToPath(
        new URL(`../../public/sample/${filename}`, import.meta.url),
      ),
    ),
  );

const text = (value: string): Uint8Array => new TextEncoder().encode(value);

const UNSUPPORTED = {
  code: "unsupported",
  message: "unsupported file type: only PDF and CSV files are accepted",
};

describe("detectFile", () => {
  it("knows a PDF by its first bytes, whatever it is called", async () => {
    const bytes = await sample("NL-88121.pdf");
    expect(detectFile("scan.bin", bytes, LIMIT)).toEqual({
      ok: true,
      value: { format: "pdf", mimeType: "application/pdf", extension: "pdf" },
    });
  });

  it.each([
    ["receipts.csv", "receipts_csv"],
    ["ap_payments.csv", "payments_csv"],
  ])("tells %s apart by its header (AC-2)", async (filename, kind) => {
    const bytes = await sample(filename);
    const detected = detectFile("export-2026.CSV", bytes, LIMIT);
    expect(detected).toMatchObject({
      ok: true,
      value: { format: "csv", kind, mimeType: "text/csv", extension: "csv" },
    });
  });

  it("drops a leading byte order mark", async () => {
    const bytes = await sample("receipts.csv");
    const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...bytes]);
    const detected = detectFile("receipts.csv", withBom, LIMIT);
    expect(detected).toMatchObject({
      ok: true,
      value: { kind: "receipts_csv" },
    });
    if (detected.ok && detected.value.format === "csv") {
      expect(detected.value.text.startsWith("po_number")).toBe(true);
    }
  });

  it("refuses a CSV whose header matches neither, with both reasons (AC-2)", () => {
    const detected = detectFile("other.csv", text("a,b\n1,2\n"), LIMIT);
    expect(detected).toEqual({
      ok: false,
      error: {
        code: "unsupported",
        message: expect.stringMatching(
          /^not a receipts or payments CSV: receipts: column 1: .+; payments: column 1: .+$/,
        ),
      },
    });
  });

  it("ignores the claimed type: a CSV body named .txt is refused (AC-4)", async () => {
    const bytes = await sample("receipts.csv");
    expect(detectFile("receipts.txt", bytes, LIMIT)).toEqual({
      ok: false,
      error: UNSUPPORTED,
    });
  });

  it("refuses a .csv that is not valid UTF-8", () => {
    expect(
      detectFile("receipts.csv", new Uint8Array([0x70, 0xff, 0xfe]), LIMIT),
    ).toEqual({ ok: false, error: UNSUPPORTED });
  });

  it("refuses a file named .pdf that does not start with %PDF-", () => {
    expect(detectFile("invoice.pdf", text("hello"), LIMIT)).toEqual({
      ok: false,
      error: UNSUPPORTED,
    });
  });

  it("refuses an empty file (AC-5)", () => {
    expect(detectFile("a.pdf", new Uint8Array(), LIMIT)).toEqual({
      ok: false,
      error: { code: "empty", message: "the file is empty" },
    });
  });

  it("refuses a file one byte over the limit, and accepts one at it (AC-5)", () => {
    const at = new Uint8Array(2 * BYTES_PER_MB);
    at.set(text("%PDF-1.7"));
    expect(detectFile("a.pdf", at, 2 * BYTES_PER_MB).ok).toBe(true);
    const over = new Uint8Array(2 * BYTES_PER_MB + 1);
    over.set(text("%PDF-1.7"));
    expect(detectFile("a.pdf", over, 2 * BYTES_PER_MB)).toEqual({
      ok: false,
      error: { code: "too_large", message: "the file is larger than 2 MB" },
    });
  });
});

describe("baseName", () => {
  it.each([
    ["NL-88121.pdf", "NL-88121.pdf"],
    ["  spaced.pdf  ", "spaced.pdf"],
    ["../../etc/passwd", "passwd"],
    ["C:\\Users\\me\\invoice.pdf", "invoice.pdf"],
    ["", "unnamed"],
    ["folder/", "unnamed"],
  ])("%j becomes %j", (input, expected) => {
    expect(baseName(input)).toBe(expected);
  });

  it("keeps at most 255 characters", () => {
    expect(baseName(`${"x".repeat(300)}.pdf`)).toHaveLength(255);
  });
});
