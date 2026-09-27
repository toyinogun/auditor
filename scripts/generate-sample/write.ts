import { mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { err, type Result } from "../../lib/schemas/result";
import type { RenderedFile } from "./render";

type Render = () => Promise<Result<readonly RenderedFile[]>>;

const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const exists = (dir: string): Promise<boolean> =>
  stat(dir).then(
    () => true,
    () => false,
  );

/** A run killed between the two renames leaves only the moved aside folder: put it back. */
const recoverInterruptedSwap = async (
  outputDir: string,
  backupDir: string,
): Promise<void> => {
  if (!(await exists(outputDir)) && (await exists(backupDir))) {
    await rename(backupDir, outputDir);
  }
  await rm(backupDir, { recursive: true, force: true });
};

/** Moves the old folder aside, moves the new one in, and only then deletes the old one. */
const swapIn = async (
  tempDir: string,
  outputDir: string,
  backupDir: string,
): Promise<void> => {
  const hadOutput = await exists(outputDir);
  if (hadOutput) await rename(outputDir, backupDir);
  try {
    await rename(tempDir, outputDir);
  } catch (error: unknown) {
    if (hadOutput) await rename(backupDir, outputDir);
    throw error;
  }
  await rm(backupDir, { recursive: true, force: true });
};

/**
 * Renders, writes every file into `tempDir`, then swaps it into `outputDir` (AC-1). A failed
 * render, write or swap leaves the previous `outputDir` in place; a run killed mid swap is
 * recovered by the next one. `tempDir` must sit on the same disk so the renames cannot fail with
 * EXDEV; the old folder waits beside it in `<tempDir>.old` until the new set is in place.
 */
export const generateSampleFolder = async (
  render: Render,
  outputDir: string,
  tempDir: string,
): Promise<Result<readonly RenderedFile[]>> => {
  const backupDir = `${tempDir}.old`;
  try {
    await recoverInterruptedSwap(outputDir, backupDir);
    await rm(tempDir, { recursive: true, force: true });
    const rendered = await render();
    if (!rendered.ok) return rendered;
    await mkdir(tempDir, { recursive: true });
    await Promise.all(
      rendered.value.map((file) =>
        writeFile(path.join(tempDir, file.filename), file.bytes),
      ),
    );
    await swapIn(tempDir, outputDir, backupDir);
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
