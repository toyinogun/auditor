import {
  IBM_Plex_Mono,
  IBM_Plex_Sans,
  Instrument_Serif,
} from "next/font/google";

/**
 * The three faces from DESIGN.md (spec 0007, AC-6), self hosted at build time. Each exposes a
 * CSS variable on <html>; `app/globals.css` maps them to `--font-sans`, `--font-mono` and
 * `--font-serif` with the DESIGN.md fallback stacks.
 */

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "600"],
  display: "swap",
  variable: "--font-plex-sans",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "600"],
  display: "swap",
  variable: "--font-plex-mono",
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  display: "swap",
  variable: "--font-instrument-serif",
});

/** Class names that declare the three font variables; put them on <html>. */
export const fontVariables = [
  plexSans.variable,
  plexMono.variable,
  instrumentSerif.variable,
].join(" ");
