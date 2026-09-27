import {
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
  mkdir,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { err, ok } from "../../lib/schemas/result";
import { generateSampleFolder, summarize } from "./write";

const bytes = (text: string) => new TextEncoder().encode(text);

let root = "";
let outputDir = "";
let tempDir = "";

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "sample-write-"));
  outputDir = path.join(root, "sample");
  tempDir = path.join(root, ".sample.tmp");
  await mkdir(outputDir);
  await writeFile(path.join(outputDir, "old.pdf"), "previous run");
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("generateSampleFolder (AC-1)", () => {
  it("replaces the folder whole, so files from an older run never survive", async () => {
    const render = async () =>
      ok([
        { filename: "a.pdf", bytes: bytes("A") },
        { filename: "b.csv", bytes: bytes("B") },
      ]);
    const result = await generateSampleFolder(render, outputDir, tempDir);
    expect(result.ok).toBe(true);
    expect((await readdir(outputDir)).sort()).toEqual(["a.pdf", "b.csv"]);
    expect(await readFile(path.join(outputDir, "a.pdf"), "utf8")).toBe("A");
    expect(await readdir(root)).toEqual(["sample"]);
  });

  it("leaves the previous folder untouched when rendering fails", async () => {
    const render = async () => err("NL-88310.pdf: line 1: does not add up");
    const result = await generateSampleFolder(render, outputDir, tempDir);
    expect(result).toEqual(err("NL-88310.pdf: line 1: does not add up"));
    expect(await readdir(outputDir)).toEqual(["old.pdf"]);
    expect(await readdir(root)).toEqual(["sample"]);
  });

  it("leaves the previous folder untouched when a write fails", async () => {
    const render = async () =>
      ok([{ filename: "missing-dir/a.pdf", bytes: bytes("A") }]);
    const result = await generateSampleFolder(render, outputDir, tempDir);
    expect(result.ok).toBe(false);
    expect(await readdir(outputDir)).toEqual(["old.pdf"]);
    expect(await readdir(root)).toEqual(["sample"]);
  });

  it("clears a stale temp folder left by an interrupted run", async () => {
    await mkdir(tempDir);
    await writeFile(path.join(tempDir, "stale.pdf"), "stale");
    const render = async () => ok([{ filename: "a.pdf", bytes: bytes("A") }]);
    await generateSampleFolder(render, outputDir, tempDir);
    expect(await readdir(outputDir)).toEqual(["a.pdf"]);
  });
});

describe("summarize", () => {
  it("lists each file with its size and a total", () => {
    const text = summarize([
      { filename: "a.pdf", bytes: new Uint8Array(2048) },
      { filename: "bb.csv", bytes: new Uint8Array(512) },
    ]);
    expect(text).toBe("a.pdf   2.0 KB\nbb.csv  0.5 KB\n2 files, 2.5 KB");
  });
});
