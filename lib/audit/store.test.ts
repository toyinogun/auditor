import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "@/lib/db/client";
import { contracts, invoices, payments, purchaseOrders } from "@/lib/db/schema";
import { TEST_NOW } from "@/lib/db/testing";
import { briefSampleRecords } from "@/lib/schemas/fixtures/brief-sample-records";
import type { AuditInput } from "@/lib/schemas/records";
import { SAMPLE_MANIFEST } from "./sample";
import {
  saveAuditInput,
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
