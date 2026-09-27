import { createHash } from "node:crypto";
import type { DocumentKind } from "../../lib/schemas/enums";
import {
  SampleManifest,
  type SampleManifestEntry,
  type SampleMimeType,
} from "../../lib/schemas/sample-manifest";
import { err, ok, type Result } from "../../lib/schemas/result";

export const MANIFEST_FILENAME = "manifest.json";

/** A rendered data file plus the facts the manifest records about it. */
export type DataFile = {
  readonly filename: string;
  readonly bytes: Uint8Array;
  readonly kind: DocumentKind;
  /** null for CSVs, false only for the scan. */
  readonly hasTextLayer: boolean | null;
};

const sha256 = (bytes: Uint8Array): string =>
  createHash("sha256").update(bytes).digest("hex");

const mimeTypeOf = (file: DataFile): SampleMimeType =>
  file.hasTextLayer === null ? "text/csv" : "application/pdf";

/** Keys in schema order, so the JSON bytes never depend on how the entry was built. */
const toEntry = (file: DataFile): SampleManifestEntry => ({
  filename: file.filename,
  kind: file.kind,
  mimeType: mimeTypeOf(file),
  sha256: sha256(file.bytes),
  sizeBytes: file.bytes.length,
  hasTextLayer: file.hasTextLayer,
});

const byFilename = (a: DataFile, b: DataFile): number =>
  a.filename < b.filename ? -1 : a.filename > b.filename ? 1 : 0;

/** The manifest for the data files, sorted by filename and checked against its schema. */
export const buildManifest = (
  files: readonly DataFile[],
): Result<SampleManifest> => {
  const manifest = { files: [...files].sort(byFilename).map(toEntry) };
  const parsed = SampleManifest.safeParse(manifest);
  return parsed.success
    ? ok(manifest)
    : err(
        `${MANIFEST_FILENAME}: ${parsed.error.issues.map((i) => i.message).join("; ")}`,
      );
};

/** Stable manifest bytes: two space JSON, trailing newline, no timestamp (AC-8). */
export const manifestBytes = (manifest: SampleManifest): Uint8Array =>
  new TextEncoder().encode(`${JSON.stringify(manifest, null, 2)}\n`);
