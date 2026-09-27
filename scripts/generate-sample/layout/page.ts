/**
 * The page model (spec 0003): a document is laid out once as plain drawing operations, then
 * painted by pdfkit (text PDFs) or canvas (the scan). Units are PDF points (1/72 inch) on a US
 * Letter page, origin top left, `y` is the text baseline. Layouts resolve alignment themselves
 * with `measure`, so painters only ever draw left aligned text.
 */

export const PAGE_WIDTH = 612;
export const PAGE_HEIGHT = 792;
export const MARGIN = 54;
export const CONTENT_RIGHT = PAGE_WIDTH - MARGIN;
export const CONTENT_WIDTH = CONTENT_RIGHT - MARGIN;

export type FontWeight = "regular" | "bold";

export type TextOp = {
  readonly kind: "text";
  readonly x: number;
  readonly y: number;
  readonly text: string;
  readonly weight: FontWeight;
  readonly size: number;
  readonly color: string;
};

export type RuleOp = {
  readonly kind: "rule";
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly width: number;
  readonly color: string;
};

export type BoxOp = {
  readonly kind: "box";
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly fill: string;
};

/** Outlined text rotated about its centre (the scan's reminder stamp). */
export type StampOp = {
  readonly kind: "stamp";
  readonly cx: number;
  readonly cy: number;
  readonly text: string;
  readonly size: number;
  readonly angle: number;
  readonly color: string;
};

export type DrawOp = TextOp | RuleOp | BoxOp | StampOp;
export type Page = readonly DrawOp[];

/** Width of `text` in points at `size` in the bundled font. */
export type Measure = (
  text: string,
  weight: FontWeight,
  size: number,
) => number;

/** PDF info for a laid out document; `date` is the fixture's YYYY-MM-DD document date. */
export type DocumentInfo = {
  readonly title: string;
  readonly author: string;
  readonly date: string;
};

export type LaidOutDocument = {
  readonly info: DocumentInfo;
  readonly pages: readonly Page[];
};
