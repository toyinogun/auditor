import { readdir } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SAMPLE_MANIFEST } from "@/lib/audit/sample";
import { getDocument } from "@/lib/db/documents";
import { documents } from "@/lib/db/schema";
import type { ExtractDeps } from "@/lib/extract/extract";
import { readSample } from "@/lib/extract/testing";
import { sampleFor } from "./demo";
import { ingestFile, retryDocument } from "./ingest";
import { harness, seededShuffle, type IngestHarness } from "./testing";

/** The demo gate (spec 0006, AC-7): only the sample files, never a model call. */

const THROWING_CLIENT: ExtractDeps = {
  apiKeySet: true,
  now: () => 0,
  createMessage: () => {
    throw new Error("the model was called in demo mode");
  },
};

const upload = async (h: IngestHarness, filename: string, bytes?: Uint8Array) =>
  ingestFile(
    h.db,
    {
      filename,
      bytes: bytes ?? (await readSample(filename)),
      source: "upload",
    },
    h.deps,
  );

describe("sampleFor", () => {
  it("knows all 14 sample files by hash and nothing else", () => {
    SAMPLE_MANIFEST.files.forEach((entry) => {
      expect(sampleFor(entry.sha256)?.entry).toEqual(entry);
    });
    expect(sampleFor("0".repeat(64))).toBeNull();
  });

  it("gives each file its fixture records under the new document id", () => {
    const invoice = SAMPLE_MANIFEST.files.find((f) => f.kind === "invoice");
    const receipts = SAMPLE_MANIFEST.files.find(
      (f) => f.kind === "receipts_csv",
    );
    const invoiceRecords = sampleFor(invoice?.sha256 ?? "")?.recordsFor(42);
    expect(invoiceRecords).toMatchObject({
      kind: "invoice",
      record: { documentId: 42, filename: invoice?.filename },
      hasTextLayer: invoice?.hasTextLayer,
    });
    const rows = sampleFor(receipts?.sha256 ?? "")?.recordsFor(7);
    expect(rows?.kind).toBe("receipts_csv");
    if (rows?.kind === "receipts_csv") {
      expect(rows.rows.every((row) => row.documentId === 7)).toBe(true);
    }
  });
});

describe("ingestFile in demo mode", () => {
  let h: IngestHarness;

  beforeEach(async () => {
    vi.spyOn(process.stdout, "write").mockReturnValue(true);
    h = await harness(THROWING_CLIENT, { demoMode: true });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await h.cleanUp();
  });

  it("ends at the brief's headline with all 14 files in any order, and never calls the model (AC-7)", async () => {
    const order = seededShuffle(
      SAMPLE_MANIFEST.files.map((file) => file.filename),
      7,
    );
    const results = [];
    for (const filename of order) results.push(await upload(h, filename));
    expect(results.filter((result) => !result.ok)).toEqual([]);
    const last = results.at(-1);
    expect(last?.ok && last.value.headline).toEqual({
      findingCount: 8,
      recoverableCents: 976_685,
      invoicedTotalCents: 5_393_960,
      recoverableShare: "18.1%",
    });
    const scanned = SAMPLE_MANIFEST.files.find(
      (file) => file.hasTextLayer === false,
    );
    const stored = h.db.select().from(documents).all();
    expect(stored.every((doc) => doc.status === "done")).toBe(true);
    expect(stored.find((doc) => doc.sha256 === scanned?.sha256)).toMatchObject({
      kind: scanned?.kind,
      hasTextLayer: false,
    });
  }, 30_000);

  it("refuses any other file and writes nothing (AC-7)", async () => {
    const bytes = new TextEncoder().encode("%PDF-1.7 not a sample");
    expect(await upload(h, "outside.pdf", bytes)).toEqual({
      ok: false,
      error: {
        code: "demo_refused",
        message: "on the demo, only the sample files can be uploaded",
        documentId: null,
      },
    });
    expect(h.db.select().from(documents).all()).toHaveLength(0);
    await expect(readdir(h.uploadsDir)).rejects.toThrow();
  });

  it("gives an oversized file the size message, not the demo one (AC-5)", async () => {
    const small = await harness(THROWING_CLIENT, {
      demoMode: true,
      maxUploadBytes: 10,
    });
    try {
      expect(await upload(small, "NL-88121.pdf")).toMatchObject({
        ok: false,
        error: { code: "too_large" },
      });
    } finally {
      await small.cleanUp();
    }
  });

  it("applies the gate to a retry of a stored outside document (AC-10)", async () => {
    const open = await harness(
      { ...THROWING_CLIENT, apiKeySet: false },
      { demoMode: false },
    );
    try {
      const bytes = new TextEncoder().encode("%PDF-1.7 outside");
      const failed = await upload(open, "outside.pdf", bytes);
      expect(failed).toMatchObject({ ok: false, error: { code: "failed" } });
      const demo = { ...open.deps, demoMode: true };
      expect(await retryDocument(open.db, 1, demo)).toMatchObject({
        ok: false,
        error: { code: "demo_refused", documentId: 1 },
      });
      expect(getDocument(open.db, 1)).toMatchObject({ status: "failed" });
    } finally {
      await open.cleanUp();
    }
  });
});
