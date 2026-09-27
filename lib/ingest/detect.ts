import { err, ok, type Result } from "@/lib/schemas/result";
import { csvKindOf, type CsvKind } from "./csv";

/**
 * What a file is, judged from its bytes (spec 0006, AC-4 and AC-5). Pure: the claimed
 * `Content-Type` is never read, and only a CSV needs its name (`*.csv`, any case).
 */

export const BYTES_PER_MB = 1_048_576;

/** Longest filename kept, as sent but trimmed to its base name (spec 0006, data model). */
const MAX_FILENAME_LENGTH = 255;
const UNNAMED = "unnamed";

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d] as const; // "%PDF-"

export type DetectedFile =
  | {
      readonly format: "pdf";
      readonly mimeType: "application/pdf";
      readonly extension: "pdf";
    }
  | {
      readonly format: "csv";
      readonly kind: CsvKind;
      readonly mimeType: "text/csv";
      readonly extension: "csv";
      /** The decoded text, byte order mark dropped, ready for the parser. */
      readonly text: string;
    };

export type DetectError = {
  readonly code: "unsupported" | "too_large" | "empty";
  readonly message: string;
};

const UNSUPPORTED: DetectError = {
  code: "unsupported",
  message: "unsupported file type: only PDF and CSV files are accepted",
};

/** The last path segment, trimmed and capped, so no user path ever reaches storage. */
export const baseName = (filename: string): string => {
  const last = filename.split(/[/\\]/).pop()?.trim() ?? "";
  return last.length === 0 ? UNNAMED : last.slice(0, MAX_FILENAME_LENGTH);
};

const startsWithPdfMagic = (bytes: Uint8Array): boolean =>
  PDF_MAGIC.every((byte, index) => bytes[index] === byte);

/** Strict UTF-8; the decoder drops a leading byte order mark by default. */
const decodeUtf8 = (bytes: Uint8Array): string | null => {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
};

const detectCsv = (bytes: Uint8Array): Result<DetectedFile, DetectError> => {
  const text = decodeUtf8(bytes);
  if (text === null) return err(UNSUPPORTED);
  const kind = csvKindOf(text);
  if (!kind.ok) return err({ code: "unsupported", message: kind.error });
  return ok({
    format: "csv",
    kind: kind.value,
    mimeType: "text/csv",
    extension: "csv",
    text,
  });
};

/** Size and empty checks first, then PDF by its first bytes, then CSV by name and header. */
export const detectFile = (
  filename: string,
  bytes: Uint8Array,
  maxBytes: number,
): Result<DetectedFile, DetectError> => {
  if (bytes.length === 0)
    return err({ code: "empty", message: "the file is empty" });
  if (bytes.length > maxBytes) {
    return err({
      code: "too_large",
      message: `the file is larger than ${maxBytes / BYTES_PER_MB} MB`,
    });
  }
  if (startsWithPdfMagic(bytes)) {
    return ok({ format: "pdf", mimeType: "application/pdf", extension: "pdf" });
  }
  return baseName(filename).toLowerCase().endsWith(".csv")
    ? detectCsv(bytes)
    : err(UNSUPPORTED);
};
