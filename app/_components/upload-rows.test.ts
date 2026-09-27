import { describe, expect, it } from "vitest";
import { mergeRows, type Row, type StoredDocumentRow } from "./upload-rows";

const stored = (
  id: number,
  filename: string,
  status: StoredDocumentRow["status"] = "done",
): StoredDocumentRow => ({
  id,
  filename,
  kind: "receipts_csv",
  status,
  error: null,
});

const local = (
  key: string,
  documentId: number | null,
  status: Row["status"],
  inFlight = false,
): Row => ({
  key,
  documentId,
  filename: "receipts.csv",
  kind: "receipts_csv",
  status,
  reason: null,
  inFlight,
});

describe("mergeRows", () => {
  it("lists the server rows when nothing is local", () => {
    const rows = mergeRows([], [stored(2, "receipts.csv")]);
    expect(rows.map((row) => row.status)).toEqual(["done"]);
  });

  it("keeps a local row with no document id above the server rows", () => {
    const rows = mergeRows(
      [local("a", null, "refused")],
      [stored(2, "receipts.csv")],
    );
    expect(rows.map((row) => row.status)).toEqual(["refused", "done"]);
  });

  it("keeps the already ingested label on a stored done row", () => {
    const rows = mergeRows(
      [local("a", 2, "already ingested")],
      [stored(2, "receipts.csv")],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe("already ingested");
  });

  // Regression: uploading the same file twice on one page left two local rows for document 2,
  // newest first, and the older "done" row won, hiding "already ingested" (spec 0006, AC-8).
  it("uses the newest local row when the same document was uploaded twice", () => {
    const rows = mergeRows(
      [local("second", 2, "already ingested"), local("first", 2, "done")],
      [stored(2, "receipts.csv")],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe("already ingested");
  });

  it("shows a newer in flight retry over an older failed local row", () => {
    const rows = mergeRows(
      [local("retry", 3, "in progress", true), local("first", 3, "failed")],
      [stored(3, "NL-88121.pdf", "failed")],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.key).toBe("retry");
  });
});
