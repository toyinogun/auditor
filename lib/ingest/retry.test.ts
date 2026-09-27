import { createHash } from "node:crypto";
import { readdir, rm } from "node:fs/promises";
import path from "node:path";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { auditRuns, documents, receipts } from "@/lib/db/schema";
import {
  getDocument,
  insertDocument,
  setDocumentStatus,
} from "@/lib/db/documents";
import { TEST_NOW } from "@/lib/db/testing";
import type { ExtractDeps } from "@/lib/extract/extract";
import { fakeMessage, fixtureClient, readSample } from "@/lib/extract/testing";
import { ingestFile, retryDocument } from "./ingest";
import { harness, type IngestHarness } from "./testing";

/** Duplicates, retry and concurrency (spec 0006, AC-8 and AC-10). */

const REJECT = fakeMessage([
  {
    type: "tool_use",
    id: "toolu_1",
    name: "reject_document",
    input: { reason: "a menu" },
  } as never,
]);

type Counted = ExtractDeps & { readonly calls: () => number };

const ingest = async (h: IngestHarness, filename: string) =>
  ingestFile(
    h.db,
    { filename, bytes: await readSample(filename), source: "upload" },
    h.deps,
  );

/** A stored CSV left `failed`, its file on disk, as a crash or bad run would leave it. */
const failedCsv = async (h: IngestHarness): Promise<number> => {
  const bytes = await readSample("receipts.csv");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  await h.deps.files.write(sha256, "csv", bytes);
  const { document } = insertDocument(h.db, {
    sha256,
    filename: "receipts.csv",
    mimeType: "text/csv",
    sizeBytes: bytes.length,
    source: "webhook",
  });
  setDocumentStatus(h.db, document.id, { status: "failed", error: "x" });
  return document.id;
};

describe("duplicates, retry and concurrency", () => {
  let client: Counted;
  let h: IngestHarness;

  beforeAll(async () => {
    client = await fixtureClient();
  });

  beforeEach(async () => {
    vi.spyOn(process.stdout, "write").mockReturnValue(true);
    h = await harness(client);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await h.cleanUp();
  });

  it("answers the same bytes again with the stored document: no row, no call, no rerun (AC-8)", async () => {
    await ingest(h, "NL-88121.pdf");
    const calls = client.calls();
    const again = await ingestFile(
      h.db,
      {
        filename: "renamed.pdf",
        bytes: await readSample("NL-88121.pdf"),
        source: "webhook",
      },
      h.deps,
    );
    expect(again).toEqual({
      ok: true,
      value: {
        documentId: 1,
        filename: "NL-88121.pdf",
        kind: "invoice",
        status: "done",
        alreadyIngested: true,
        headline: expect.any(Object),
      },
    });
    expect(client.calls()).toBe(calls);
    expect(h.db.select().from(documents).all()).toHaveLength(1);
    expect(h.db.select().from(auditRuns).all()).toHaveLength(1);
  });

  it("makes one model call when the same bytes arrive twice at once (AC-8)", async () => {
    const calls = client.calls();
    const [first, second] = await Promise.all([
      ingest(h, "NL-88203.pdf"),
      ingest(h, "NL-88203.pdf"),
    ]);
    expect(client.calls() - calls).toBe(1);
    expect([first.ok, second.ok].sort()).toEqual([false, true]);
    const refused = first.ok ? second : first;
    expect(refused).toEqual({
      ok: false,
      error: {
        code: "in_progress",
        message: "already being processed",
        documentId: 1,
      },
    });
  });

  it("retries a failed PDF from its saved file with a good client (AC-9, AC-10)", async () => {
    const flaky = await fixtureClient(new Map([["NL-88121.pdf", [REJECT]]]));
    const f = await harness(flaky);
    try {
      const failed = await ingest(f, "NL-88121.pdf");
      expect(failed).toMatchObject({ ok: false, error: { code: "failed" } });
      const retried = await retryDocument(f.db, 1, f.deps);
      expect(retried).toMatchObject({
        ok: true,
        value: { documentId: 1, kind: "invoice", alreadyIngested: false },
      });
      expect(getDocument(f.db, 1)).toMatchObject({
        status: "done",
        error: null,
        kind: "invoice",
      });
      expect(flaky.calls()).toBe(2);
    } finally {
      await f.cleanUp();
    }
  });

  it("counts the same bytes uploaded again after a failure as a retry (AC-8)", async () => {
    const flaky = await fixtureClient(new Map([["NL-88121.pdf", [REJECT]]]));
    const f = await harness(flaky);
    try {
      await ingest(f, "NL-88121.pdf");
      expect(await ingest(f, "NL-88121.pdf")).toMatchObject({
        ok: true,
        value: { documentId: 1, alreadyIngested: false },
      });
      expect(f.db.select().from(documents).all()).toHaveLength(1);
    } finally {
      await f.cleanUp();
    }
  });

  it("retries a failed CSV, working out its kind again from the bytes (AC-10)", async () => {
    const id = await failedCsv(h);
    expect(getDocument(h.db, id)?.kind).toBeNull();
    expect(await retryDocument(h.db, id, h.deps)).toMatchObject({
      ok: true,
      value: { kind: "receipts_csv" },
    });
  });

  it("saves a failed CSV's rows once when two retries start together (AC-10)", async () => {
    const id = await failedCsv(h);
    const results = await Promise.all([
      retryDocument(h.db, id, h.deps),
      retryDocument(h.db, id, h.deps),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.find((result) => !result.ok)).toMatchObject({
      error: { code: "in_progress" },
    });
    const rowCount = (await readSample("receipts.csv")).reduce(
      (lines, byte) => lines + (byte === 0x0a ? 1 : 0),
      0,
    );
    expect(h.db.select().from(receipts).all()).toHaveLength(rowCount - 1);
  });

  it("keeps the document failed when its saved file is missing (AC-10)", async () => {
    const id = await failedCsv(h);
    const [name] = await readdir(h.uploadsDir);
    await rm(path.join(h.uploadsDir, name));
    expect(await retryDocument(h.db, id, h.deps)).toEqual({
      ok: false,
      error: {
        code: "failed",
        message: "the saved file is missing, upload it again",
        documentId: id,
      },
    });
    expect(getDocument(h.db, id)).toMatchObject({
      status: "failed",
      error: "the saved file is missing, upload it again",
    });
  });

  it("refuses to retry a document that is done, in flight or unknown", async () => {
    await ingest(h, "receipts.csv");
    expect(await retryDocument(h.db, 1, h.deps)).toMatchObject({
      ok: false,
      error: { code: "not_failed", documentId: 1 },
    });
    const { document } = insertDocument(h.db, {
      sha256: "b".repeat(64),
      filename: "x.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1,
      source: "upload",
    });
    expect(await retryDocument(h.db, document.id, h.deps)).toMatchObject({
      ok: false,
      error: { code: "in_progress" },
    });
    expect(await retryDocument(h.db, 99, h.deps)).toEqual({
      ok: false,
      error: {
        code: "not_failed",
        message: "document 99 does not exist",
        documentId: null,
      },
    });
  });

  it("marks the document failed and rethrows when a bug escapes mid ingest", async () => {
    const broken = await harness(client, {
      extract: () => Promise.reject(new Error("a bug")),
      clock: () => TEST_NOW,
    });
    try {
      await expect(ingest(broken, "NL-88121.pdf")).rejects.toThrow("a bug");
      expect(getDocument(broken.db, 1)).toMatchObject({
        status: "failed",
        error: "an unexpected error stopped this file, retry it",
      });
    } finally {
      await broken.cleanUp();
    }
  });
});
