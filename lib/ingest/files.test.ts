import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createUploadStore, type UploadStore } from "./files";

const SHA = "a".repeat(64);
const bytes = new TextEncoder().encode("%PDF-1.7 test");

describe("createUploadStore", () => {
  let root: string;
  let dir: string;
  let store: UploadStore;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "uploads-test-"));
    dir = path.join(root, "uploads");
    store = createUploadStore(dir);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("writes by hash, creating the folder, and leaves no temp file", async () => {
    await store.write(SHA, "pdf", bytes);
    expect(await readdir(dir)).toEqual([`${SHA}.pdf`]);
    expect(await store.read(SHA, "pdf")).toEqual(bytes);
  });

  it("keeps the first file when the same hash is written again", async () => {
    await store.write(SHA, "pdf", bytes);
    await store.write(SHA, "pdf", new TextEncoder().encode("other"));
    expect(await store.read(SHA, "pdf")).toEqual(bytes);
  });

  it("reads a missing file as null, even before the folder exists", async () => {
    expect(await store.read(SHA, "csv")).toBeNull();
  });

  it("refuses a name that is not a sha256", async () => {
    await expect(store.write("../escape", "pdf", bytes)).rejects.toThrow(
      "not a sha256",
    );
  });

  it("clears every file, and clearing a missing folder is fine (AC-14)", async () => {
    await expect(store.clear()).resolves.toBeUndefined();
    await store.write(SHA, "pdf", bytes);
    await store.write("b".repeat(64), "csv", bytes);
    await store.clear();
    expect(await readdir(dir)).toEqual([]);
  });

  it("sweeps only leftover temp files (AC-11)", async () => {
    await store.write(SHA, "pdf", bytes);
    await writeFile(path.join(dir, `${SHA}.csv.tmp-1234`), bytes);
    expect(await store.sweepTemp()).toBe(1);
    expect(await readdir(dir)).toEqual([`${SHA}.pdf`]);
    expect(await store.sweepTemp()).toBe(0);
  });
});
