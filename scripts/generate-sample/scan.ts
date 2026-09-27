import type { LaidOutDocument } from "./layout/page";
import { paintScanPng } from "./paint-canvas";
import { imageOnlyPdf } from "./paint-pdf";

/**
 * The NL88310 reminder as an image only scan (AC-4): its one page is painted to a PNG and placed
 * on a PDF page that draws no text, so the file has no text layer.
 */
export const paintScan = (doc: LaidOutDocument): Promise<Uint8Array> => {
  if (doc.pages.length !== 1) {
    throw new Error(`scan: ${doc.info.title} must be a single page`);
  }
  return imageOnlyPdf(paintScanPng(doc.pages[0]), doc.info);
};
