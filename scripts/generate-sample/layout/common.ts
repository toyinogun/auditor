import { FOOTER_TEXT, type Party } from "../parties";
import {
  CONTENT_RIGHT,
  MARGIN,
  PAGE_HEIGHT,
  PAGE_WIDTH,
  type DrawOp,
  type FontWeight,
  type Measure,
  type Page,
  type TextOp,
} from "./page";

/** Shared building blocks for the document layouts. All pure. */

export const INK = "#1a1a1a";
export const MUTED = "#555555";
export const LINE_COLOR = "#9a9a9a";
export const SHADE = "#ececec";

export const BODY_SIZE = 9;
export const LINE_HEIGHT = 13;
export const FOOTER_TOP = PAGE_HEIGHT - 44;
/** Content must end above this y so it never meets the footer. */
export const CONTENT_BOTTOM = FOOTER_TOP - 18;

type TextStyle = {
  readonly weight?: FontWeight;
  readonly size?: number;
  readonly color?: string;
};

export const text = (
  x: number,
  y: number,
  value: string,
  style: TextStyle = {},
): TextOp => ({
  kind: "text",
  x,
  y,
  text: value,
  weight: style.weight ?? "regular",
  size: style.size ?? BODY_SIZE,
  color: style.color ?? INK,
});

/** Text whose right edge sits at `right`. */
export const rightText = (
  measure: Measure,
  right: number,
  y: number,
  value: string,
  style: TextStyle = {},
): TextOp => {
  const op = text(right, y, value, style);
  return { ...op, x: right - measure(value, op.weight, op.size) };
};

/** Text centred on `centre`. */
export const centredText = (
  measure: Measure,
  centre: number,
  y: number,
  value: string,
  style: TextStyle = {},
): TextOp => {
  const op = text(centre, y, value, style);
  return { ...op, x: centre - measure(value, op.weight, op.size) / 2 };
};

export const rule = (
  y: number,
  x1 = MARGIN,
  x2 = CONTENT_RIGHT,
  width = 0.75,
): DrawOp => ({ kind: "rule", x1, y1: y, x2, y2: y, width, color: LINE_COLOR });

/** Stacked lines from `y`, one op per line. */
export const textLines = (
  x: number,
  y: number,
  lines: readonly string[],
  style: TextStyle = {},
): readonly TextOp[] =>
  lines.map((line, index) => text(x, y + index * LINE_HEIGHT, line, style));

/** The issuer's letterhead on the left and the document title on the right. */
export const letterhead = (
  measure: Measure,
  party: Party,
  title: string,
): readonly DrawOp[] => [
  text(MARGIN, 72, party.name, { weight: "bold", size: 16 }),
  ...textLines(
    MARGIN,
    90,
    [...party.addressLines, `Phone ${party.phone}`, party.email],
    { color: MUTED },
  ),
  rightText(measure, CONTENT_RIGHT, 74, title, { weight: "bold", size: 20 }),
  rule(150, MARGIN, CONTENT_RIGHT, 1.25),
];

/** A labelled block of lines, e.g. "Bill to" and an address. */
export const partyBlock = (
  x: number,
  y: number,
  label: string,
  party: Party,
): readonly DrawOp[] => [
  text(x, y, label, { weight: "bold", color: MUTED }),
  ...textLines(x, y + LINE_HEIGHT, [party.name, ...party.addressLines]),
];

/** The fictional notice on every page (AC-9). */
export const footer = (measure: Measure): readonly DrawOp[] => [
  rule(FOOTER_TOP),
  centredText(measure, PAGE_WIDTH / 2, FOOTER_TOP + 16, FOOTER_TEXT, {
    size: 8,
    color: MUTED,
  }),
];

export type Column = {
  readonly header: string;
  /** Left edge for left aligned columns, right edge for right aligned ones. */
  readonly x: number;
  readonly align: "left" | "right";
};

const cell = (
  measure: Measure,
  column: Column,
  y: number,
  value: string,
  style: TextStyle = {},
): TextOp =>
  column.align === "right"
    ? rightText(measure, column.x, y, value, style)
    : text(column.x, y, value, style);

const ROW_HEIGHT = 18;

/** A table with a shaded header row; returns its ops and the y just below it. */
export const table = (
  measure: Measure,
  columns: readonly Column[],
  rows: readonly (readonly string[])[],
  top: number,
): { readonly ops: readonly DrawOp[]; readonly bottom: number } => {
  const header: readonly DrawOp[] = [
    {
      kind: "box",
      x: MARGIN,
      y: top,
      width: CONTENT_RIGHT - MARGIN,
      height: ROW_HEIGHT,
      fill: SHADE,
    },
    ...columns.map((column) =>
      cell(measure, column, top + 12.5, column.header, { weight: "bold" }),
    ),
  ];
  const body = rows.flatMap((row, index) => {
    const baseline = top + ROW_HEIGHT * (index + 1) + 12.5;
    return [
      ...row.map((value, col) => cell(measure, columns[col], baseline, value)),
      rule(top + ROW_HEIGHT * (index + 2), MARGIN, CONTENT_RIGHT, 0.4),
    ];
  });
  return {
    ops: [...header, ...body],
    bottom: top + ROW_HEIGHT * (rows.length + 1),
  };
};

/** Greedy word wrap; a single word is never split, so "2.5%" never breaks. */
export const wrapText = (
  measure: Measure,
  value: string,
  weight: FontWeight,
  size: number,
  width: number,
): readonly string[] =>
  value.split(" ").reduce<readonly string[]>((lines, word) => {
    const last = lines.at(-1);
    if (last === undefined) return [word];
    const joined = `${last} ${word}`;
    return measure(joined, weight, size) <= width
      ? [...lines.slice(0, -1), joined]
      : [...lines, word];
  }, []);

/** A block of fixed height that draws itself at a given top y. */
export type Block = {
  readonly height: number;
  readonly draw: (top: number) => readonly DrawOp[];
};

/**
 * Flows blocks down pages, starting a new page when the next block would reach the footer.
 * `continuation` draws the top of every page after the first and returns where content starts.
 */
export const flowPages = (
  blocks: readonly Block[],
  firstTop: number,
  continuation: (pageNo: number) => {
    readonly ops: readonly DrawOp[];
    readonly top: number;
  },
  measure: Measure,
): readonly Page[] => {
  type State = {
    readonly pages: readonly (readonly DrawOp[])[];
    readonly y: number;
  };
  const start: State = { pages: [[]], y: firstTop };
  const flowed = blocks.reduce<State>((state, block) => {
    const fits = state.y + block.height <= CONTENT_BOTTOM;
    const current = fits
      ? state
      : (() => {
          const next = continuation(state.pages.length + 1);
          return { pages: [...state.pages, next.ops], y: next.top };
        })();
    const pages = current.pages;
    const last = pages[pages.length - 1];
    return {
      pages: [...pages.slice(0, -1), [...last, ...block.draw(current.y)]],
      y: current.y + block.height,
    };
  }, start);
  return flowed.pages.map((ops) => [...ops, ...footer(measure)]);
};
