import "server-only";
import { extractText, getDocumentProxy } from "unpdf";
import { err, ok, type Result } from "@/lib/schemas/result";

/** Fewer letters and digits than this per page means a scan with no usable text layer (AC-2). */
export const SCAN_CHARS_PER_PAGE = 20;

/** The page cap, checked before any model call (AC-7). */
export const MAX_PAGES = 20;

const PDF_MAGIC = "%PDF-";

export type PdfText = {
  readonly pages: readonly string[];
  readonly pageCount: number;
  readonly hasTextLayer: boolean;
};

const startsWithMagic = (bytes: Uint8Array): boolean =>
  bytes.length >= PDF_MAGIC.length &&
  [...PDF_MAGIC].every((char, index) => bytes[index] === char.charCodeAt(0));

const LETTER_OR_DIGIT = /[\p{L}\p{N}]/gu;

const countLettersAndDigits = (pages: readonly string[]): number =>
  pages.reduce(
    (total, page) => total + (page.match(LETTER_OR_DIGIT)?.length ?? 0),
    0,
  );

const readText = async (
  bytes: Uint8Array,
): Promise<
  Result<{ readonly pages: readonly string[]; readonly pageCount: number }>
> => {
  try {
    // pdf.js takes ownership of the buffer it is given, so it gets a copy.
    const pdf = await getDocumentProxy(bytes.slice());
    const { totalPages, text } = await extractText(pdf, { mergePages: false });
    return ok({ pages: text, pageCount: totalPages });
  } catch {
    return err("could not read the PDF");
  }
};

/** The `%PDF-` guard, the text of each page, the page cap and the scan rule (AC-2, AC-7). */
export const readPdf = async (bytes: Uint8Array): Promise<Result<PdfText>> => {
  if (!startsWithMagic(bytes)) return err("not a PDF");
  const read = await readText(bytes);
  if (!read.ok) return read;
  const { pages, pageCount } = read.value;
  if (pageCount > MAX_PAGES) {
    return err(
      `the PDF has ${pageCount} pages, more than the ${MAX_PAGES} page limit`,
    );
  }
  if (pageCount === 0) return err("could not read the PDF");
  const hasTextLayer =
    countLettersAndDigits(pages) / pageCount >= SCAN_CHARS_PER_PAGE;
  return ok({ pages, pageCount, hasTextLayer });
};
