import PDFDocument from "pdfkit";
import { describe, expect, it } from "vitest";
import { MAX_PAGES, readPdf } from "./pdf";
import { readSample } from "./testing";

/** A plain text PDF with `pageCount` pages, built in memory. */
const textPdf = (pageCount: number): Promise<Uint8Array> =>
  new Promise((resolve, reject) => {
    const pdf = new PDFDocument({ autoFirstPage: false });
    const chunks: Buffer[] = [];
    pdf.on("data", (chunk: Buffer) => chunks.push(chunk));
    pdf.on("end", () => resolve(new Uint8Array(Buffer.concat(chunks))));
    pdf.on("error", reject);
    Array.from({ length: pageCount }).forEach((_, index) =>
      pdf.addPage().text(`Page ${index + 1} of a long test document`),
    );
    pdf.end();
  });

describe("readPdf", () => {
  it("reads a text PDF page by page with a text layer (AC-2)", async () => {
    const result = await readPdf(await readSample("NL-88121.pdf"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.hasTextLayer).toBe(true);
    expect(result.value.pageCount).toBe(result.value.pages.length);
    expect(result.value.pages.join(" ")).toContain("NL-88121");
  });

  it("marks the image only scan as having no text layer (AC-2, AC-11)", async () => {
    const result = await readPdf(await readSample("NL88310.pdf"));
    expect(result).toMatchObject({ ok: true, value: { hasTextLayer: false } });
  });

  it("leaves the caller's bytes usable", async () => {
    const bytes = await readSample("NL88310.pdf");
    await readPdf(bytes);
    expect(bytes.byteLength).toBeGreaterThan(0);
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe("%PDF-");
  });

  it("refuses bytes that are not a PDF (AC-7)", async () => {
    const random = new Uint8Array(512).map((_, index) => (index * 37) % 256);
    expect(await readPdf(random)).toEqual({ ok: false, error: "not a PDF" });
    expect(await readPdf(new Uint8Array())).toEqual({
      ok: false,
      error: "not a PDF",
    });
  });

  it("refuses more than the page limit, naming the count (AC-7)", async () => {
    const result = await readPdf(await textPdf(MAX_PAGES + 1));
    expect(result).toEqual({
      ok: false,
      error: "the PDF has 21 pages, more than the 20 page limit",
    });
  });

  it("accepts exactly the page limit", async () => {
    const result = await readPdf(await textPdf(MAX_PAGES));
    expect(result).toMatchObject({ ok: true, value: { pageCount: 20 } });
  });

  it("reports a truncated PDF as unreadable (AC-7)", async () => {
    const bytes = await readSample("NL-88121.pdf");
    expect(await readPdf(bytes.slice(0, 64))).toEqual({
      ok: false,
      error: "could not read the PDF",
    });
  });
});
