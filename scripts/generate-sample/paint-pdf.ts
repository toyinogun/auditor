import PDFDocument from "pdfkit";
import { FONT_FILES } from "./fonts";
import { infoDate } from "./format";
import type {
  DocumentInfo,
  DrawOp,
  FontWeight,
  LaidOutDocument,
  Measure,
} from "./layout/page";

/**
 * pdfkit painters (spec 0003). The info dates are fixed to the document's own date, so pdfkit's
 * file ID (derived from them) and every byte are the same on every run.
 */

type Pdf = InstanceType<typeof PDFDocument>;

const FONT_NAME: Readonly<Record<FontWeight, string>> = {
  regular: "Inter",
  bold: "Inter-Bold",
};

const createPdf = (info: DocumentInfo): Pdf => {
  const date = infoDate(info.date);
  const pdf = new PDFDocument({
    size: "LETTER",
    margin: 0,
    autoFirstPage: false,
    compress: true,
    info: {
      Title: info.title,
      Author: info.author,
      CreationDate: date,
      ModDate: date,
    },
  });
  pdf.registerFont(FONT_NAME.regular, FONT_FILES.regular);
  pdf.registerFont(FONT_NAME.bold, FONT_FILES.bold);
  return pdf;
};

/** Collects the whole PDF once `end()` is called. */
const collect = (pdf: Pdf): Promise<Uint8Array> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    pdf.on("data", (chunk: Buffer) => chunks.push(chunk));
    pdf.on("end", () => resolve(new Uint8Array(Buffer.concat(chunks))));
    pdf.on("error", reject);
  });

/** Text widths from the embedded font, for layouts to align and wrap with. */
export const createMeasure = (): Measure => {
  const pdf = createPdf({
    title: "measure",
    author: "measure",
    date: "2026-01-01",
  });
  return (value, weight, size) =>
    pdf.font(FONT_NAME[weight]).fontSize(size).widthOfString(value);
};

const drawOp = (pdf: Pdf, op: DrawOp): void => {
  switch (op.kind) {
    case "text":
      pdf
        .font(FONT_NAME[op.weight])
        .fontSize(op.size)
        .fillColor(op.color)
        .text(op.text, op.x, op.y, {
          lineBreak: false,
          baseline: "alphabetic",
        });
      return;
    case "rule":
      pdf
        .moveTo(op.x1, op.y1)
        .lineTo(op.x2, op.y2)
        .lineWidth(op.width)
        .strokeColor(op.color)
        .stroke();
      return;
    case "box":
      pdf.rect(op.x, op.y, op.width, op.height).fillColor(op.fill).fill();
      return;
    case "stamp":
      throw new Error("paint-pdf: stamps are drawn only on the scan (canvas)");
  }
};

/** A laid out document as text PDF bytes. */
export const paintPdf = (doc: LaidOutDocument): Promise<Uint8Array> => {
  const pdf = createPdf(doc.info);
  const bytes = collect(pdf);
  doc.pages.forEach((page) => {
    pdf.addPage();
    page.forEach((op) => drawOp(pdf, op));
  });
  pdf.end();
  return bytes;
};

/** One Letter page holding only `png`, no text at all: the image only scan (AC-4). */
export const imageOnlyPdf = (
  png: Uint8Array,
  info: DocumentInfo,
): Promise<Uint8Array> => {
  const pdf = createPdf(info);
  const bytes = collect(pdf);
  pdf.addPage();
  pdf.image(Buffer.from(png), 0, 0, { width: 612, height: 792 });
  pdf.end();
  return bytes;
};
