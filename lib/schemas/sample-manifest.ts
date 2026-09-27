import { z } from "zod";
import { DocumentKind } from "./enums";

/**
 * `public/sample/manifest.json` (spec 0003): every sample data file with the facts ingest needs
 * (sha256, size, kind, text layer), so offline mode and the demo upload allowlist never hash
 * anything themselves. Written by `scripts/generate-sample/`; app code reads it with this schema.
 */

/** The 12 PDFs plus the two CSVs; the manifest does not list itself. */
export const SAMPLE_MANIFEST_FILE_COUNT = 14;

export const SampleMimeType = z.enum(["application/pdf", "text/csv"]);
export type SampleMimeType = z.infer<typeof SampleMimeType>;

const EXTENSION_MIME: Readonly<Record<string, SampleMimeType>> = {
  ".pdf": "application/pdf",
  ".csv": "text/csv",
};

const extensionOf = (filename: string): string =>
  filename.slice(filename.lastIndexOf(".")).toLowerCase();

export const SampleManifestEntry = z
  .object({
    filename: z.string().min(1),
    kind: DocumentKind,
    mimeType: SampleMimeType,
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    sizeBytes: z.int().positive(),
    hasTextLayer: z.boolean().nullable(),
  })
  .refine(
    (entry) => EXTENSION_MIME[extensionOf(entry.filename)] === entry.mimeType,
    {
      message: "mimeType does not match the file extension",
      path: ["mimeType"],
    },
  )
  .refine(
    (entry) =>
      (entry.mimeType === "text/csv") === (entry.hasTextLayer === null),
    {
      message: "hasTextLayer is null for CSVs and true or false for PDFs",
      path: ["hasTextLayer"],
    },
  )
  .readonly();
export type SampleManifestEntry = z.infer<typeof SampleManifestEntry>;

const isSortedUnique = (names: readonly string[]): boolean =>
  names.every((name, index) => index === 0 || names[index - 1] < name);

export const SampleManifest = z
  .object({
    files: z
      .array(SampleManifestEntry)
      .length(SAMPLE_MANIFEST_FILE_COUNT)
      .refine((files) => isSortedUnique(files.map((file) => file.filename)), {
        message: "files must be sorted by filename with no repeats",
      })
      .readonly(),
  })
  .readonly();
export type SampleManifest = z.infer<typeof SampleManifest>;
