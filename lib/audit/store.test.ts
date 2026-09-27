import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "@/lib/db/client";
import { eq } from "drizzle-orm";
import {
  contracts,
  documents,
  invoices,
  payments,
  purchaseOrders,
} from "@/lib/db/schema";
import { TEST_NOW } from "@/lib/db/testing";
import { briefSampleRecords } from "@/lib/schemas/fixtures/brief-sample-records";
import type { AuditInput } from "@/lib/schemas/records";
import { SAMPLE_MANIFEST } from "./sample";
import {
  saveAuditInput,
  saveDocumentRecords,
  storeManifestDocuments,
  trySaveAuditInput,
  type CsvRefs,
  type RefFor,
} from "./store";

const setUp = (db: Db): { refFor: RefFor; csvRefs: CsvRefs } => {
  const refFor = storeManifestDocuments(db, SAMPLE_MANIFEST, TEST_NOW);
  return {
    refFor,
    csvRefs: {
      receipts: refFor("receipts.csv"),
      payments: refFor("ap_payments.csv"),
    },
  };
};

/** The fixture with one invoice file also read as a copy of the first contract. */
const withOverlappingContract = (
  input: AuditInput,
  refFor: RefFor,
): AuditInput => ({
  ...input,
  contracts: [
    ...input.contracts,
    { ...input.contracts[0], ...refFor("BW-5521.pdf") },
  ],
});

describe("storeManifestDocuments", () => {
  let db: Db;
  beforeEach(() => {
    db = openDb(":memory:");
  });

  it("gives every manifest file a ref, numbered in manifest order", () => {
    const refFor = storeManifestDocuments(db, SAMPLE_MANIFEST, TEST_NOW);
    const ids = SAMPLE_MANIFEST.files.map(
      (file) => refFor(file.filename).documentId,
    );
    expect(ids).toEqual(ids.toSorted((a, b) => a - b));
    expect(new Set(ids).size).toBe(SAMPLE_MANIFEST.files.length);
  });

  it("throws for a filename outside the manifest (a bug)", () => {
    const refFor = storeManifestDocuments(db, SAMPLE_MANIFEST, TEST_NOW);
    expect(() => refFor("stray.pdf")).toThrow(
      "stray.pdf is not in the manifest",
    );
  });
});

describe("trySaveAuditInput", () => {
  let db: Db;
  beforeEach(() => {
    db = openDb(":memory:");
  });

  it("saves every fixture record", () => {
    const { refFor, csvRefs } = setUp(db);
    const result = trySaveAuditInput(
      db,
      briefSampleRecords(refFor),
      csvRefs,
      TEST_NOW,
    );
    expect(result).toEqual({ ok: true, value: undefined });
    expect(db.select().from(contracts).all()).toHaveLength(2);
    expect(db.select().from(purchaseOrders).all()).toHaveLength(4);
    expect(db.select().from(invoices).all()).toHaveLength(6);
    expect(db.select().from(payments).all()).toHaveLength(5);
  });

  it("returns the first refused save as a value, naming its file (AC-10)", () => {
    const { refFor, csvRefs } = setUp(db);
    const result = trySaveAuditInput(
      db,
      withOverlappingContract(briefSampleRecords(refFor), refFor),
      csvRefs,
      TEST_NOW,
    );
    expect(result).toEqual({
      ok: false,
      error: {
        filename: "BW-5521.pdf",
        error: expect.stringMatching(/overlaps C-2026-014/),
      },
    });
  });

  it("stops at the refusal and saves nothing after it", () => {
    const { refFor, csvRefs } = setUp(db);
    trySaveAuditInput(
      db,
      withOverlappingContract(briefSampleRecords(refFor), refFor),
      csvRefs,
      TEST_NOW,
    );
    expect(db.select().from(purchaseOrders).all()).toEqual([]);
    expect(db.select().from(invoices).all()).toEqual([]);
    expect(db.select().from(payments).all()).toEqual([]);
  });
});

describe("saveAuditInput", () => {
  it("throws a refusal, naming the file, since the fixture should never be refused", () => {
    const db = openDb(":memory:");
    const { refFor, csvRefs } = setUp(db);
    expect(() =>
      saveAuditInput(
        db,
        withOverlappingContract(briefSampleRecords(refFor), refFor),
        csvRefs,
        TEST_NOW,
      ),
    ).toThrow(/^BW-5521\.pdf: contract C-2026-014 .* overlaps C-2026-014/);
  });
});

describe("saveDocumentRecords", () => {
  let db: Db;
  let refFor: RefFor;
  beforeEach(() => {
    db = openDb(":memory:");
    refFor = storeManifestDocuments(db, SAMPLE_MANIFEST, TEST_NOW);
  });

  const docOf = (filename: string) =>
    db
      .select()
      .from(documents)
      .where(eq(documents.id, refFor(filename).documentId))
      .get();

  it("stores an invoice with its text layer flag and marks it done", () => {
    const [invoice] = briefSampleRecords(refFor).invoices;
    expect(
      saveDocumentRecords(
        db,
        { kind: "invoice", record: invoice, hasTextLayer: false },
        TEST_NOW + 1,
      ),
    ).toEqual({ ok: true, value: undefined });
    expect(docOf(invoice.filename)).toMatchObject({
      status: "done",
      kind: "invoice",
      hasTextLayer: false,
      updatedAt: TEST_NOW + 1,
    });
    expect(db.select().from(invoices).all()).toHaveLength(1);
  });

  it("stores CSV rows under their document and marks it done", () => {
    const { payments: rows } = briefSampleRecords(refFor);
    const { documentId } = refFor("ap_payments.csv");
    expect(
      saveDocumentRecords(db, { kind: "payments_csv", documentId, rows }).ok,
    ).toBe(true);
    expect(db.select().from(payments).all()).toHaveLength(rows.length);
    expect(docOf("ap_payments.csv")).toMatchObject({ status: "done" });
  });

  it("returns a refusal as err and rolls back the text layer flag", () => {
    const [contract] = briefSampleRecords(refFor).contracts;
    saveDocumentRecords(db, {
      kind: "contract",
      record: contract,
      hasTextLayer: true,
    });
    const copy = { ...contract, ...refFor("BW-5521.pdf") };
    const saved = saveDocumentRecords(db, {
      kind: "contract",
      record: copy,
      hasTextLayer: false,
    });
    expect(saved).toEqual({
      ok: false,
      error: expect.stringContaining("overlaps"),
    });
    expect(docOf("BW-5521.pdf")).toMatchObject({
      status: "queued",
      hasTextLayer: null,
    });
    expect(db.select().from(contracts).all()).toHaveLength(1);
  });

  it("turns a broken database constraint into a plain err, without schema names", () => {
    const { receipts: rows } = briefSampleRecords(refFor);
    const { documentId } = refFor("receipts.csv");
    const twice = [rows[0], { ...rows[1], rowNo: rows[0].rowNo }];
    const saved = saveDocumentRecords(db, {
      kind: "receipts_csv",
      documentId,
      rows: twice,
    });
    expect(saved).toEqual({
      ok: false,
      error: "the database refused a record: it repeats one already stored",
    });
    expect(JSON.stringify(saved)).not.toMatch(/UNIQUE|receipts\.|constraint/);
    expect(docOf("receipts.csv")).toMatchObject({ status: "queued" });
  });
});
