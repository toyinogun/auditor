import { readdir } from "node:fs/promises";
import { eq } from "drizzle-orm";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";
import { latestAuditRun } from "@/lib/db/audit";
import {
  auditRuns,
  documents,
  invoices,
  payments,
  receipts,
} from "@/lib/db/schema";
import { TEST_NOW } from "@/lib/db/testing";
import type { ExtractDeps } from "@/lib/extract/extract";
import { fakeMessage, fixtureClient, readSample } from "@/lib/extract/testing";
import { SAMPLE_MANIFEST } from "@/lib/audit/sample";
import { ingestFile } from "./ingest";
import { harness, seededShuffle, type IngestHarness } from "./testing";

const BRIEF_HEADLINE = {
  findingCount: 8,
  recoverableCents: 976_685,
  invoicedTotalCents: 5_393_960,
  recoverableShare: "18.1%",
};

const REJECT = fakeMessage([
  {
    type: "tool_use",
    id: "toolu_1",
    name: "reject_document",
    input: { reason: "a menu" },
  } as never,
]);

const upload = async (
  h: IngestHarness,
  filename: string,
  source: "upload" | "webhook" = "upload",
) =>
  ingestFile(
    h.db,
    { filename, bytes: await readSample(filename), source },
    h.deps,
  );

const docRow = (h: IngestHarness, id: number) =>
  h.db.select().from(documents).where(eq(documents.id, id)).get();

type CallsSpy = { readonly mock: { readonly calls: readonly unknown[][] } };

const ingestLines = (spy: CallsSpy) =>
  spy.mock.calls
    .map(
      ([line]: readonly unknown[]) =>
        JSON.parse(String(line)) as Record<string, unknown>,
    )
    .filter((line) => line.event === "ingest");

describe("ingestFile", () => {
  let client: ExtractDeps & { readonly calls: () => number };
  let h: IngestHarness;
  let stdout: MockInstance<typeof process.stdout.write>;

  beforeAll(async () => {
    client = await fixtureClient();
  });

  beforeEach(async () => {
    stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    h = await harness(client);
  });

  afterEach(async () => {
    stdout.mockRestore();
    await h.cleanUp();
  });

  it("stores a PDF by hash, extracts it, reruns the audit and returns the headline (AC-1, AC-12)", async () => {
    const result = await upload(h, "NL-88121.pdf");
    const entry = SAMPLE_MANIFEST.files.find(
      (file) => file.filename === "NL-88121.pdf",
    );
    expect(result).toEqual({
      ok: true,
      value: {
        documentId: 1,
        filename: "NL-88121.pdf",
        kind: "invoice",
        status: "done",
        alreadyIngested: false,
        headline: expect.objectContaining({ findingCount: expect.any(Number) }),
      },
    });
    expect(docRow(h, 1)).toMatchObject({
      sha256: entry?.sha256,
      source: "upload",
      mimeType: "application/pdf",
      sizeBytes: entry?.sizeBytes,
      status: "done",
      kind: "invoice",
      hasTextLayer: entry?.hasTextLayer,
      error: null,
    });
    expect(h.db.select().from(invoices).all()).toHaveLength(1);
    expect(h.db.select().from(auditRuns).all()).toHaveLength(1);
    expect(await readdir(h.uploadsDir)).toEqual([`${entry?.sha256}.pdf`]);
  });

  it("stores a CSV told apart by its header with no model call (AC-2)", async () => {
    const before = client.calls();
    const result = await ingestFile(
      h.db,
      {
        filename: "export.CSV",
        bytes: await readSample("receipts.csv"),
        source: "webhook",
      },
      h.deps,
    );
    expect(result).toMatchObject({
      ok: true,
      value: { kind: "receipts_csv", status: "done", filename: "export.CSV" },
    });
    expect(client.calls()).toBe(before);
    expect(docRow(h, 1)).toMatchObject({
      source: "webhook",
      mimeType: "text/csv",
      kind: "receipts_csv",
      hasTextLayer: null,
      status: "done",
    });
    expect(h.db.select().from(receipts).all().length).toBeGreaterThan(0);
  });

  it("ingests the 12 PDFs and both CSVs in a shuffled order and ends at the brief's figures (AC-12)", async () => {
    const order = seededShuffle(
      SAMPLE_MANIFEST.files.map((file) => file.filename),
      20260927,
    );
    const results = [];
    for (const filename of order) results.push(await upload(h, filename));
    expect(results.every((result) => result.ok)).toBe(true);
    const last = results.at(-1);
    expect(last?.ok && last.value.headline).toEqual(BRIEF_HEADLINE);
    expect(latestAuditRun(h.db)).toMatchObject({
      findingCount: 8,
      recoverableTotalCents: 976_685,
    });
  }, 30_000);

  it("keeps a failed PDF with its reason and the file, stores nothing and leaves the audit alone (AC-9)", async () => {
    const rejecting = await fixtureClient(
      new Map([["NL-88121.pdf", [REJECT]]]),
    );
    const bad = await harness(rejecting);
    try {
      await ingestFile(
        bad.db,
        {
          filename: "receipts.csv",
          bytes: await readSample("receipts.csv"),
          source: "upload",
        },
        bad.deps,
      );
      const runBefore = latestAuditRun(bad.db);
      const result = await ingestFile(
        bad.db,
        {
          filename: "NL-88121.pdf",
          bytes: await readSample("NL-88121.pdf"),
          source: "upload",
        },
        bad.deps,
      );
      expect(result).toEqual({
        ok: false,
        error: {
          code: "failed",
          message: expect.stringContaining(
            "not an invoice, contract or purchase order",
          ),
          documentId: 2,
        },
      });
      expect(docRow(bad, 2)).toMatchObject({
        status: "failed",
        kind: null,
        error: expect.stringContaining("a menu"),
      });
      expect(bad.db.select().from(invoices).all()).toHaveLength(0);
      expect(latestAuditRun(bad.db)).toEqual(runBefore);
      expect(await readdir(bad.uploadsDir)).toHaveLength(2);
    } finally {
      await bad.cleanUp();
    }
  });

  it("fails a CSV with a bad row and stores none of its rows (AC-9)", async () => {
    const text = new TextDecoder().decode(await readSample("ap_payments.csv"));
    const broken = `${text.trimEnd()}\nnot,enough\n`;
    const result = await ingestFile(
      h.db,
      {
        filename: "ap_payments.csv",
        bytes: new TextEncoder().encode(broken),
        source: "upload",
      },
      h.deps,
    );
    expect(result).toMatchObject({
      ok: false,
      error: { code: "failed", message: expect.stringMatching(/^row \d+: /) },
    });
    expect(docRow(h, 1)).toMatchObject({ status: "failed", kind: null });
    expect(h.db.select().from(payments).all()).toHaveLength(0);
    expect(h.db.select().from(auditRuns).all()).toHaveLength(0);
  });

  it("fails a PDF with no API key, before any call", async () => {
    const noKey = await harness({
      apiKeySet: false,
      now: () => 0,
      createMessage: () => Promise.reject(new Error("called")),
    });
    try {
      const result = await ingestFile(
        noKey.db,
        {
          filename: "NL-88121.pdf",
          bytes: await readSample("NL-88121.pdf"),
          source: "upload",
        },
        noKey.deps,
      );
      expect(result).toMatchObject({
        ok: false,
        error: { code: "failed", message: "ANTHROPIC_API_KEY is not set" },
      });
    } finally {
      await noKey.cleanUp();
    }
  });

  it.each([
    [
      "an unknown type",
      "notes.txt",
      new TextEncoder().encode("hi"),
      "unsupported",
    ],
    ["an empty file", "a.pdf", new Uint8Array(), "empty"],
  ])(
    "refuses %s before writing anything (AC-4, AC-5)",
    async (_label, filename, bytes, code) => {
      const result = await ingestFile(
        h.db,
        { filename, bytes, source: "upload" },
        h.deps,
      );
      expect(result).toMatchObject({
        ok: false,
        error: { code, documentId: null },
      });
      expect(h.db.select().from(documents).all()).toHaveLength(0);
      await expect(readdir(h.uploadsDir)).rejects.toThrow();
    },
  );

  it("refuses a file over the limit (AC-5)", async () => {
    const small = await harness(client, { maxUploadBytes: 1_048_576 });
    try {
      const bytes = new Uint8Array(1_048_577);
      bytes.set(new TextEncoder().encode("%PDF-1.7"));
      const result = await ingestFile(
        small.db,
        { filename: "big.pdf", bytes, source: "upload" },
        small.deps,
      );
      expect(result).toEqual({
        ok: false,
        error: {
          code: "too_large",
          message: "the file is larger than 1 MB",
          documentId: null,
        },
      });
    } finally {
      await small.cleanUp();
    }
  });

  it("keeps only the base name of the filename", async () => {
    const result = await ingestFile(
      h.db,
      {
        filename: "../../C:\\tmp\\NL-88121.pdf",
        bytes: await readSample("NL-88121.pdf"),
        source: "upload",
      },
      h.deps,
    );
    expect(result).toMatchObject({
      ok: true,
      value: { filename: "NL-88121.pdf" },
    });
  });

  it("writes one ingest log line with counts and outcome only (AC-16)", async () => {
    await upload(h, "NL-88121.pdf", "webhook");
    await ingestFile(
      h.db,
      { filename: "x.txt", bytes: new Uint8Array([1]), source: "upload" },
      h.deps,
    );
    const lines = ingestLines(stdout);
    expect(lines).toEqual([
      {
        event: "ingest",
        source: "webhook",
        filename: "NL-88121.pdf",
        kind: "invoice",
        outcome: "done",
        sizeBytes: expect.any(Number),
        alreadyIngested: false,
        documentId: 1,
        ms: 0,
        at: expect.any(String),
      },
      expect.objectContaining({
        outcome: "unsupported",
        kind: null,
        documentId: null,
      }),
    ]);
    expect(JSON.stringify(lines)).not.toContain("unsupported file type");
  });
});

describe("ingestFile timing", () => {
  it("measures ms with the clock", async () => {
    const client = await fixtureClient();
    const ticks = { value: TEST_NOW };
    const h = await harness(client, { clock: () => (ticks.value += 5) });
    const stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    try {
      await upload(h, "receipts.csv");
      const [line] = ingestLines(stdout);
      expect(line.ms).toBeGreaterThan(0);
    } finally {
      stdout.mockRestore();
      await h.cleanUp();
    }
  });
});
