import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { openDb, type Db } from "@/lib/db/client";
import { TEST_NOW } from "@/lib/db/testing";
import { extractDocument, type ExtractDeps } from "@/lib/extract/extract";
import { BYTES_PER_MB } from "./detect";
import { createUploadStore } from "./files";
import type { IngestDeps } from "./ingest";

/** Test support: an in memory database, a temp uploads folder and fake deps. Not imported by app code. */

export type IngestHarness = {
  readonly db: Db;
  readonly deps: IngestDeps;
  readonly uploadsDir: string;
  readonly cleanUp: () => Promise<void>;
};

export const harness = async (
  client: ExtractDeps,
  overrides: Partial<IngestDeps> = {},
): Promise<IngestHarness> => {
  const root = await mkdtemp(path.join(tmpdir(), "ingest-test-"));
  const uploadsDir = path.join(root, "uploads");
  return {
    db: openDb(":memory:"),
    uploadsDir,
    deps: {
      extract: (input) => extractDocument(input, client),
      files: createUploadStore(uploadsDir),
      demoMode: false,
      maxUploadBytes: 10 * BYTES_PER_MB,
      clock: () => TEST_NOW,
      ...overrides,
    },
    cleanUp: () => rm(root, { recursive: true, force: true }),
  };
};

/** Fisher Yates with a seeded generator, so a shuffled order is the same on every run. */
export const seededShuffle = <T>(items: readonly T[], seed: number): T[] => {
  const state = { value: seed };
  const next = (): number => {
    state.value = (state.value * 1_103_515_245 + 12_345) % 2 ** 31;
    return state.value / 2 ** 31;
  };
  return items.reduce<T[]>(
    (shuffled, _item, index) => {
      const last = items.length - 1 - index;
      const pick = Math.floor(next() * (last + 1));
      [shuffled[last], shuffled[pick]] = [shuffled[pick], shuffled[last]];
      return shuffled;
    },
    [...items],
  );
};
