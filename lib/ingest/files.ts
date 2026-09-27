import "server-only";
import { randomUUID } from "node:crypto";
import {
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

/**
 * The uploads folder (spec 0006, AC-17): the only code that reads or writes it. Files are named
 * `<sha256>.<extension>` only, so no user filename ever becomes a path, and each one is written
 * to a temp name first and then renamed, so a file on disk is always complete.
 */

export type UploadExtension = "pdf" | "csv";

export type UploadStore = {
  readonly dir: string;
  /** Saves the bytes unless a file with this hash is already there. */
  readonly write: (
    sha256: string,
    extension: UploadExtension,
    bytes: Uint8Array,
  ) => Promise<void>;
  /** The saved bytes, or null when the file is missing. */
  readonly read: (
    sha256: string,
    extension: UploadExtension,
  ) => Promise<Uint8Array | null>;
  /** Deletes every file in the folder (spec 0006, AC-14). */
  readonly clear: () => Promise<void>;
  /** Deletes temp files a crash left behind (AC-11); returns how many. */
  readonly sweepTemp: () => Promise<number>;
};

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const TEMP_MARKER = ".tmp-";

const isMissing = (error: unknown): boolean =>
  error instanceof Error && "code" in error && error.code === "ENOENT";

/** A hash that is not 64 hex characters means a caller bug, so it throws. */
const fileName = (sha256: string, extension: UploadExtension): string => {
  if (!SHA256_PATTERN.test(sha256)) throw new Error(`not a sha256: ${sha256}`);
  return `${sha256}.${extension}`;
};

const exists = async (file: string): Promise<boolean> => {
  try {
    await stat(file);
    return true;
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
};

const listFiles = async (dir: string): Promise<readonly string[]> => {
  try {
    return await readdir(dir);
  } catch (error) {
    if (isMissing(error)) return [];
    throw error;
  }
};

export const createUploadStore = (dir: string): UploadStore => {
  // The folder is only known at run time, so keep the bundler from tracing the whole project.
  const inDir = (name: string): string =>
    path.join(/* turbopackIgnore: true */ dir, name);
  return {
    dir,
    write: async (sha256, extension, bytes) => {
      const target = inDir(fileName(sha256, extension));
      if (await exists(target)) return;
      await mkdir(dir, { recursive: true });
      const temp = `${target}${TEMP_MARKER}${randomUUID()}`;
      try {
        await writeFile(temp, bytes);
        await rename(temp, target);
      } catch (error) {
        await rm(temp, { force: true });
        throw error;
      }
    },
    read: async (sha256, extension) => {
      try {
        return new Uint8Array(
          await readFile(inDir(fileName(sha256, extension))),
        );
      } catch (error) {
        if (isMissing(error)) return null;
        throw error;
      }
    },
    clear: async () => {
      const names = await listFiles(dir);
      await Promise.all(
        names.map((name) => rm(inDir(name), { force: true, recursive: true })),
      );
    },
    sweepTemp: async () => {
      const temps = (await listFiles(dir)).filter((name) =>
        name.includes(TEMP_MARKER),
      );
      await Promise.all(temps.map((name) => rm(inDir(name), { force: true })));
      return temps.length;
    },
  };
};
