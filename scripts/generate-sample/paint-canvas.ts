import { createCanvas, GlobalFonts, type SKRSContext2D } from "@napi-rs/canvas";
import { FONT_FILES } from "./fonts";
import { PAGE_HEIGHT, PAGE_WIDTH, type DrawOp, type Page } from "./layout/page";

/**
 * The canvas painter for the scan (spec 0003): the same Page the text PDF uses, painted at
 * 200 DPI in grayscale on off white paper, tilted slightly, with faint speckle. Every random
 * choice comes from mulberry32 with a fixed seed, never Math.random.
 */

const DPI = 200;
const SCALE = DPI / 72;
export const SCAN_WIDTH_PX = Math.round(PAGE_WIDTH * SCALE);
export const SCAN_HEIGHT_PX = Math.round(PAGE_HEIGHT * SCALE);

const SCAN_SEED = 0x88310;
const TILT_DEGREES = 0.4;
const PAPER_TONE = "#f2efe7";
const SPECKLE_COUNT = 900;
const FONT_FAMILY = "Inter";

/** One mulberry32 step: a value in [0, 1) and the next state. */
export const mulberry32 = (
  state: number,
): { readonly value: number; readonly state: number } => {
  const next = (state + 0x6d2b79f5) >>> 0;
  const a = Math.imul(next ^ (next >>> 15), next | 1);
  const b = (a + Math.imul(a ^ (a >>> 7), a | 61)) ^ a;
  return { value: ((b ^ (b >>> 14)) >>> 0) / 4294967296, state: next };
};

/** `count` seeded values in [0, 1). */
export const seededValues = (seed: number, count: number): readonly number[] =>
  Array.from({ length: count }).reduce<{
    readonly values: readonly number[];
    readonly state: number;
  }>(
    (acc) => {
      const step = mulberry32(acc.state);
      return { values: [...acc.values, step.value], state: step.state };
    },
    { values: [], state: seed },
  ).values;

type Speckle = {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly shade: number;
};

const speckles = (): readonly Speckle[] => {
  const values = seededValues(SCAN_SEED, SPECKLE_COUNT * 4);
  return Array.from({ length: SPECKLE_COUNT }, (_, i) => ({
    x: values[i * 4] * SCAN_WIDTH_PX,
    y: values[i * 4 + 1] * SCAN_HEIGHT_PX,
    radius: 0.6 + values[i * 4 + 2] * 1.4,
    shade: Math.round(110 + values[i * 4 + 3] * 90),
  }));
};

const registerFonts = (): void => {
  if (!GlobalFonts.has(FONT_FAMILY)) {
    GlobalFonts.registerFromPath(FONT_FILES.regular, FONT_FAMILY);
    GlobalFonts.registerFromPath(FONT_FILES.bold, FONT_FAMILY);
  }
};

const fontFor = (weight: "regular" | "bold", size: number): string =>
  `${weight === "bold" ? "bold " : ""}${size}px ${FONT_FAMILY}`;

const drawOp = (ctx: SKRSContext2D, op: DrawOp): void => {
  switch (op.kind) {
    case "text":
      ctx.font = fontFor(op.weight, op.size);
      ctx.fillStyle = op.color;
      ctx.fillText(op.text, op.x, op.y);
      return;
    case "rule":
      ctx.strokeStyle = op.color;
      ctx.lineWidth = op.width;
      ctx.beginPath();
      ctx.moveTo(op.x1, op.y1);
      ctx.lineTo(op.x2, op.y2);
      ctx.stroke();
      return;
    case "box":
      ctx.fillStyle = op.fill;
      ctx.fillRect(op.x, op.y, op.width, op.height);
      return;
    case "stamp": {
      ctx.save();
      ctx.translate(op.cx, op.cy);
      ctx.rotate((op.angle * Math.PI) / 180);
      ctx.font = fontFor("bold", op.size);
      const width = ctx.measureText(op.text).width;
      const padX = op.size * 0.6;
      const padY = op.size * 0.5;
      ctx.strokeStyle = op.color;
      ctx.lineWidth = 2;
      ctx.strokeRect(
        -width / 2 - padX,
        -op.size / 2 - padY,
        width + padX * 2,
        op.size + padY * 2,
      );
      ctx.fillStyle = op.color;
      ctx.textBaseline = "middle";
      ctx.fillText(op.text, -width / 2, 0);
      ctx.restore();
      return;
    }
  }
};

/** Luminance per pixel, in integers, so the scan is grayscale. */
const toGrayscale = (ctx: SKRSContext2D): void => {
  const image = ctx.getImageData(0, 0, SCAN_WIDTH_PX, SCAN_HEIGHT_PX);
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    const gray = Math.round(
      (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000,
    );
    data[i] = gray;
    data[i + 1] = gray;
    data[i + 2] = gray;
  }
  ctx.putImageData(image, 0, 0);
};

/** One page painted as a scanned PNG. */
export const paintScanPng = (page: Page): Uint8Array => {
  registerFonts();
  const canvas = createCanvas(SCAN_WIDTH_PX, SCAN_HEIGHT_PX);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = PAPER_TONE;
  ctx.fillRect(0, 0, SCAN_WIDTH_PX, SCAN_HEIGHT_PX);

  ctx.save();
  ctx.translate(SCAN_WIDTH_PX / 2, SCAN_HEIGHT_PX / 2);
  ctx.rotate((TILT_DEGREES * Math.PI) / 180);
  ctx.translate(-SCAN_WIDTH_PX / 2, -SCAN_HEIGHT_PX / 2);
  ctx.scale(SCALE, SCALE);
  ctx.textBaseline = "alphabetic";
  page.forEach((op) => drawOp(ctx, op));
  ctx.restore();

  speckles().forEach((dot) => {
    ctx.fillStyle = `rgba(${dot.shade}, ${dot.shade}, ${dot.shade}, 0.55)`;
    ctx.beginPath();
    ctx.arc(dot.x, dot.y, dot.radius, 0, Math.PI * 2);
    ctx.fill();
  });

  toGrayscale(ctx);
  return new Uint8Array(canvas.toBuffer("image/png"));
};
