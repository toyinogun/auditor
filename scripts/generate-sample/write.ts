import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { err, type Result } from "../../lib/schemas/result";
import type { RenderedFile } from "./render";

type Render = () => Promise<Result<readonly RenderedFile[]>>;

const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * Renders, writes every file into `tempDir`, then swaps it into `outputDir` (AC-1). A failed
 * render or write leaves `outputDir` untouched; `tempDir` must sit on the same disk so the rename
 * cannot fail with EXDEV. The previous folder is only removed once the new set is complete.
 */
export const generateSampleFolder = async (
  render: Render,
  outputDir: string,
  tempDir: string,
): Promise<Result<readonly RenderedFile[]>> => {
  try {
    await rm(tempDir, { recursive: true, force: true });
    const rendered = await render();
    if (!rendered.ok) return rendered;
    await mkdir(tempDir, { recursive: true });
    await Promise.all(
      rendered.value.map((file) =>
        writeFile(path.join(tempDir, file.filename), file.bytes),
      ),
    );
    await rm(outputDir, { recursive: true, force: true });
    await rename(tempDir, outputDir);
    return rendered;
  } catch (error: unknown) {
    await rm(tempDir, { recursive: true, force: true });
    return err(`writing ${outputDir}: ${describeError(error)}`);
  }
};

/** "C-2026-014.pdf  18.2 KB" lines plus a total, for the CLI summary. */
export const summarize = (files: readonly RenderedFile[]): string => {
  const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`;
  const width = Math.max(...files.map((file) => file.filename.length));
  const total = files.reduce((sum, file) => sum + file.bytes.length, 0);
  return [
    ...files.map(
      (file) => `${file.filename.padEnd(width)}  ${kb(file.bytes.length)}`,
    ),
    `${files.length} files, ${kb(total)}`,
  ].join("\n");
};
