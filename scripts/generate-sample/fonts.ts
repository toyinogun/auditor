import { fileURLToPath } from "node:url";
import type { FontWeight } from "./layout/page";

/** The committed Inter TTFs (SIL OFL, see fonts/OFL.txt), shared by both painters. */
export const FONT_FILES: Readonly<Record<FontWeight, string>> = {
  regular: fileURLToPath(new URL("./fonts/Inter-Regular.ttf", import.meta.url)),
  bold: fileURLToPath(new URL("./fonts/Inter-Bold.ttf", import.meta.url)),
};
