import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "./client";
import {
  claimDocument,
  DOCUMENT_LIST_LIMIT,
  getDocument,
  insertDocument,
  listDocuments,
  setDocumentStatus,
} from "./documents";
import { documents } from "./schema";
import { TEST_NOW } from "./testing";

const doc = {
  sha256: "abc123",
  filename: "NL-88310.pdf",
  mimeType: "application/pdf",
  sizeBytes: 4096,
  source: "upload" as const,
};

describe("insertDocument", () => {
  let db: Db;
  beforeEach(() => {
    db = openDb(":memory:");
  });

  it("stores a new document as queued", () => {
    const { document, alreadyIngested } = insertDocument(db, doc, TEST_NOW);
    expect(alreadyIngested).toBe(false);
    expect(document).toMatchObject({
      ...doc,
      status: "queued",
      kind: null,
      createdAt: TEST_NOW,
    });
  });

  it("returns the existing document for the same sha256 and adds no row", () => {
    const first = insertDocument(db, doc, TEST_NOW);
    const again = insertDocument(
      db,
      { ...doc, filename: "renamed.pdf" },
      TEST_NOW + 1,
    );
    expect(again.alreadyIngested).toBe(true);
    expect(again.document).toEqual(first.document);
    expect(db.select().from(documents).all()).toHaveLength(1);
  });
});

describe("setDocumentStatus", () => {
  let db: Db;
  beforeEach(() => {
    db = openDb(":memory:");
  });

  it("records a failure with its reason, then clears it on success", () => {
    const { document } = insertDocument(db, doc, TEST_NOW);
    const failed = setDocumentStatus(
      db,
      document.id,
      { status: "failed", error: "line 1: bad" },
      TEST_NOW + 5,
    );
    expect(failed).toMatchObject({
      ok: true,
      value: {
        status: "failed",
        error: "line 1: bad",
        updatedAt: TEST_NOW + 5,
      },
    });
    const extracting = setDocumentStatus(
      db,
      document.id,
      { status: "extracting", hasTextLayer: false },
      TEST_NOW + 6,
    );
    expect(extracting).toMatchObject({
      ok: true,
      value: { status: "extracting", error: null, hasTextLayer: false },
    });
  });

  it("fails for an unknown id", () => {
    expect(setDocumentStatus(db, 42, { status: "done" })).toEqual({
      ok: false,
      error: "document 42 does not exist",
    });
  });
});

describe("claimDocument", () => {
  let db: Db;
  beforeEach(() => {
    db = openDb(":memory:");
  });

  it("moves a queued document to extracting once; a second claim gets null", () => {
    const { document } = insertDocument(db, doc, TEST_NOW);
    expect(
      claimDocument(db, document.id, "queued", TEST_NOW + 1),
    ).toMatchObject({
      id: document.id,
      status: "extracting",
      updatedAt: TEST_NOW + 1,
    });
    expect(claimDocument(db, document.id, "queued")).toBeNull();
  });

  it("claims a failed document only from failed, clearing its error", () => {
    const { document } = insertDocument(db, doc, TEST_NOW);
    expect(claimDocument(db, document.id, "failed")).toBeNull();
    setDocumentStatus(db, document.id, { status: "failed", error: "bad" });
    expect(claimDocument(db, document.id, "failed")).toMatchObject({
      status: "extracting",
      error: null,
    });
  });

  it("returns null for an unknown id", () => {
    expect(claimDocument(db, 99, "queued")).toBeNull();
  });
});

describe("getDocument and listDocuments", () => {
  let db: Db;
  beforeEach(() => {
    db = openDb(":memory:");
  });

  it("gets one document by id, or null", () => {
    const { document } = insertDocument(db, doc, TEST_NOW);
    expect(getDocument(db, document.id)).toEqual(document);
    expect(getDocument(db, 99)).toBeNull();
  });

  it("lists newest first with the fields the panel shows", () => {
    insertDocument(db, doc, TEST_NOW);
    insertDocument(
      db,
      { ...doc, sha256: "def", filename: "b.csv" },
      TEST_NOW + 1,
    );
    insertDocument(
      db,
      { ...doc, sha256: "ghi", filename: "c.pdf" },
      TEST_NOW + 1,
    );
    expect(listDocuments(db).map((item) => item.filename)).toEqual([
      "c.pdf",
      "b.csv",
      "NL-88310.pdf",
    ]);
    expect(listDocuments(db)[0]).toEqual({
      id: 3,
      filename: "c.pdf",
      kind: null,
      status: "queued",
      error: null,
    });
  });

  it("caps the list at DOCUMENT_LIST_LIMIT", () => {
    Array.from({ length: DOCUMENT_LIST_LIMIT + 1 }, (_, index) =>
      insertDocument(db, { ...doc, sha256: `sha-${index}` }, TEST_NOW + index),
    );
    expect(listDocuments(db)).toHaveLength(DOCUMENT_LIST_LIMIT);
  });
});
