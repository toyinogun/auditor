import { describe, expect, it } from "vitest";
import { SampleManifest, SAMPLE_MANIFEST_FILE_COUNT } from "./sample-manifest";

const HASH = "a".repeat(64);

const pdf = (filename: string, hasTextLayer = true) => ({
  filename,
  kind: "invoice",
  mimeType: "application/pdf",
  sha256: HASH,
  sizeBytes: 1024,
  hasTextLayer,
});

const csv = (filename: string, kind: string) => ({
  filename,
  kind,
  mimeType: "text/csv",
  sha256: HASH,
  sizeBytes: 64,
  hasTextLayer: null,
});

const validFiles = () =>
  [
    ...Array.from({ length: 11 }, (_, i) =>
      pdf(`A-${String(i).padStart(2, "0")}.pdf`),
    ),
    pdf("NL88310.pdf", false),
    csv("ap_payments.csv", "payments_csv"),
    csv("receipts.csv", "receipts_csv"),
  ].sort((a, b) => (a.filename < b.filename ? -1 : 1));

describe("SampleManifest", () => {
  it("accepts 14 sorted, unique entries", () => {
    const parsed = SampleManifest.safeParse({ files: validFiles() });
    expect(parsed.success).toBe(true);
    expect(SAMPLE_MANIFEST_FILE_COUNT).toBe(14);
  });

  it("rejects the wrong number of files", () => {
    const parsed = SampleManifest.safeParse({ files: validFiles().slice(1) });
    expect(parsed.success).toBe(false);
  });

  it("rejects entries that are not sorted by filename", () => {
    const files = validFiles();
    const swapped = [files[1], files[0], ...files.slice(2)];
    expect(SampleManifest.safeParse({ files: swapped }).success).toBe(false);
  });

  it("rejects a repeated filename", () => {
    const files = validFiles();
    const repeated = [files[0], files[0], ...files.slice(2)];
    expect(SampleManifest.safeParse({ files: repeated }).success).toBe(false);
  });

  it("rejects a hash that is not 64 lowercase hex characters", () => {
    const files = validFiles();
    const bad = [{ ...files[0], sha256: "A".repeat(64) }, ...files.slice(1)];
    expect(SampleManifest.safeParse({ files: bad }).success).toBe(false);
  });

  it("rejects a mime type that does not match the extension", () => {
    const files = validFiles();
    const bad = [{ ...files[0], mimeType: "text/csv" }, ...files.slice(1)];
    expect(SampleManifest.safeParse({ files: bad }).success).toBe(false);
  });

  it("rejects a CSV with a text layer flag, or a PDF without one", () => {
    const files = validFiles();
    const csvIndex = files.findIndex((f) => f.mimeType === "text/csv");
    const badCsv = files.map((f, i) =>
      i === csvIndex ? { ...f, hasTextLayer: true } : f,
    );
    expect(SampleManifest.safeParse({ files: badCsv }).success).toBe(false);
    const badPdf = files.map((f, i) =>
      i === 0 ? { ...f, hasTextLayer: null } : f,
    );
    expect(SampleManifest.safeParse({ files: badPdf }).success).toBe(false);
  });

  it("rejects a zero size", () => {
    const files = validFiles();
    const bad = [{ ...files[0], sizeBytes: 0 }, ...files.slice(1)];
    expect(SampleManifest.safeParse({ files: bad }).success).toBe(false);
  });
});
