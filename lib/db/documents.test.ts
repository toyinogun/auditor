import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "./client";
import { insertDocument, setDocumentStatus } from "./documents";
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
