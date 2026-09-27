import "server-only";
import { createHash } from "node:crypto";
import { latestHeadline, type Headline } from "@/lib/audit/headline";
import { runAudit } from "@/lib/audit/run";
import { saveDocumentRecords, type DocumentRecords } from "@/lib/audit/store";
import type { Db } from "@/lib/db/client";
import {
  claimDocument,
  getDocument,
  insertDocument,
  setDocumentStatus,
  type StoredDocument,
} from "@/lib/db/documents";
import type { ExtractedDocument, ExtractInput } from "@/lib/extract/extract";
import { logEvent } from "@/lib/log";
import {
  toContractRecord,
  toInvoiceRecord,
  toPaymentRecord,
  toPurchaseOrderRecord,
  toReceiptRecord,
} from "@/lib/schemas/convert";
import type { DocumentKind } from "@/lib/schemas/enums";
import type { DocumentRef } from "@/lib/schemas/records";
import { err, ok, type Result } from "@/lib/schemas/result";
import { parsePaymentsCsv, parseReceiptsCsv } from "./csv";
import { sampleFor, type SampleFile } from "./demo";
import { baseName, detectFile, type DetectedFile } from "./detect";
import type { UploadStore } from "./files";

/**
 * One intake path for the browser and n8n (spec 0006): check the file, save it by its hash,
 * extract or parse it, store its records and rerun the audit. Expected failures come back as
 * `err`; a file that fails after it is stored stays `failed` with its reason, ready to retry.
 */

export type IngestSource = "upload" | "webhook";

export type IngestInput = {
  readonly filename: string;
  readonly bytes: Uint8Array;
  readonly source: IngestSource;
};

export type IngestDeps = {
  readonly extract: (input: ExtractInput) => Promise<Result<ExtractedDocument>>;
  readonly files: UploadStore;
  readonly demoMode: boolean;
  readonly maxUploadBytes: number;
  readonly clock: () => number;
};

export type IngestOutcome = {
  readonly documentId: number;
  readonly filename: string;
  readonly kind: DocumentKind | null;
  readonly status: "done";
  readonly alreadyIngested: boolean;
  readonly headline: Headline | null;
};

export type IngestErrorCode =
  | "unsupported"
  | "too_large"
  | "empty"
  | "demo_refused"
  | "in_progress"
  | "not_failed"
  | "no_file"
  | "failed";

export type IngestError = {
  readonly code: IngestErrorCode;
  readonly message: string;
  readonly documentId: number | null;
};

type IngestResult = Result<IngestOutcome, IngestError>;

const UNEXPECTED_FAILURE = "an unexpected error stopped this file, retry it";
const MISSING_FILE = "the saved file is missing, upload it again";
const DEMO_REFUSED = "on the demo, only the sample files can be uploaded";

/** A file that passed the checks: what it is, its bytes, and its sample entry on the demo. */
type CheckedFile = {
  readonly detected: DetectedFile;
  readonly bytes: Uint8Array;
  readonly sample: SampleFile | null;
};

const refuse = (
  code: IngestErrorCode,
  message: string,
  documentId: number | null = null,
): IngestResult => err({ code, message, documentId });

const sha256Of = (bytes: Uint8Array): string =>
  createHash("sha256").update(bytes).digest("hex");

/** A PDF's extraction as its record, converted again under the stored document's ref. */
const pdfRecords = (
  extracted: ExtractedDocument,
  ref: DocumentRef,
): Result<DocumentRecords> => {
  const { hasTextLayer } = extracted;
  switch (extracted.kind) {
    case "invoice": {
      const record = toInvoiceRecord(extracted.extraction, ref);
      return record.ok
        ? ok({ kind: "invoice", record: record.value, hasTextLayer })
        : record;
    }
    case "contract": {
      const record = toContractRecord(extracted.extraction, ref);
      return record.ok
        ? ok({ kind: "contract", record: record.value, hasTextLayer })
        : record;
    }
    case "purchase_order": {
      const record = toPurchaseOrderRecord(extracted.extraction, ref);
      return record.ok
        ? ok({ kind: "purchase_order", record: record.value, hasTextLayer })
        : record;
    }
  }
};

/** Converts every row, stopping at the first that fails. */
const convertRows = <Row, Rec>(
  rows: readonly Row[],
  ref: DocumentRef,
  convert: (row: Row, ref: DocumentRef, rowNo: number) => Result<Rec>,
): Result<readonly Rec[]> => {
  const converted = rows.map((row, index) => convert(row, ref, index + 1));
  const failed = converted.find((result) => !result.ok);
  if (failed && !failed.ok) return failed;
  return ok(converted.flatMap((result) => (result.ok ? [result.value] : [])));
};

const csvRecords = (
  detected: Extract<DetectedFile, { format: "csv" }>,
  ref: DocumentRef,
): Result<DocumentRecords> => {
  const { documentId } = ref;
  if (detected.kind === "receipts_csv") {
    const parsed = parseReceiptsCsv(detected.text);
    if (!parsed.ok) return parsed;
    const rows = convertRows(parsed.value, ref, toReceiptRecord);
    return rows.ok
      ? ok({ kind: "receipts_csv", documentId, rows: rows.value })
      : rows;
  }
  const parsed = parsePaymentsCsv(detected.text);
  if (!parsed.ok) return parsed;
  const rows = convertRows(parsed.value, ref, toPaymentRecord);
  return rows.ok
    ? ok({ kind: "payments_csv", documentId, rows: rows.value })
    : rows;
};

/**
 * Step 7: the records, from the fixture on the demo, the model for a PDF, or the parsers for a
 * CSV. The model is never called in demo mode (spec 0006, key invariants).
 */
const recordsFor = async (
  document: StoredDocument,
  file: CheckedFile,
  deps: IngestDeps,
): Promise<Result<DocumentRecords>> => {
  if (file.sample !== null) return ok(file.sample.recordsFor(document.id));
  if (deps.demoMode)
    throw new Error("demo mode reached ingest without a sample");
  const ref = { documentId: document.id, filename: document.filename };
  if (file.detected.format === "csv") return csvRecords(file.detected, ref);
  const extracted = await deps.extract({
    filename: document.filename,
    bytes: file.bytes,
  });
  return extracted.ok ? pdfRecords(extracted.value, ref) : extracted;
};

/** Step 3: on the demo only a file whose hash is in the sample manifest passes (AC-7). */
const demoGate = (
  sha256: string,
  deps: IngestDeps,
  documentId: number | null,
): Result<SampleFile | null, IngestError> => {
  if (!deps.demoMode) return ok(null);
  const sample = sampleFor(sha256);
  return sample === null
    ? err({ code: "demo_refused", message: DEMO_REFUSED, documentId })
    : ok(sample);
};

/** Where a stored document's file lives, from the type `detectFile` recorded. */
const extensionOf = (document: StoredDocument): "pdf" | "csv" =>
  document.mimeType === "text/csv" ? "csv" : "pdf";

/** Marks a document `failed` with this reason and answers with it. */
const failWith = (
  db: Db,
  document: StoredDocument,
  reason: string,
  deps: IngestDeps,
): IngestResult => {
  setDocumentStatus(
    db,
    document.id,
    { status: "failed", error: reason },
    deps.clock(),
  );
  return refuse("failed", reason, document.id);
};

/**
 * Steps 7 to 9 for a document this caller has claimed (`extracting`): get the records, store
 * them (which marks it `done`) or mark it `failed` with the reason, then rerun the audit.
 */
const processClaimed = async (
  db: Db,
  document: StoredDocument,
  file: CheckedFile,
  deps: IngestDeps,
): Promise<IngestResult> => {
  const records = await recordsFor(document, file, deps);
  const saved = records.ok
    ? saveDocumentRecords(db, records.value, deps.clock())
    : records;
  if (!saved.ok) return failWith(db, document, saved.error, deps);
  runAudit(db, deps.clock);
  return ok({
    documentId: document.id,
    filename: document.filename,
    kind: records.ok ? records.value.kind : null,
    status: "done",
    alreadyIngested: false,
    headline: latestHeadline(db),
  });
};

/** AC-8: the same bytes again. Done answers as before; in flight is refused; failed retries. */
const ingestExisting = async (
  db: Db,
  document: StoredDocument,
  file: CheckedFile,
  deps: IngestDeps,
): Promise<IngestResult> => {
  switch (document.status) {
    case "done":
      return ok({
        documentId: document.id,
        filename: document.filename,
        kind: document.kind,
        status: "done",
        alreadyIngested: true,
        headline: latestHeadline(db),
      });
    case "queued":
    case "extracting":
      return refuse("in_progress", "already being processed", document.id);
    case "failed":
      return claimAndProcess(db, document, "failed", file, deps);
  }
};

/** Step 6: one conditional update; no row back means another caller holds the document. */
const claimAndProcess = async (
  db: Db,
  document: StoredDocument,
  from: "queued" | "failed",
  file: CheckedFile,
  deps: IngestDeps,
): Promise<IngestResult> => {
  const claimed = claimDocument(db, document.id, from, deps.clock());
  if (claimed === null) {
    return refuse("in_progress", "already being processed", document.id);
  }
  try {
    return await processClaimed(db, claimed, file, deps);
  } catch (error) {
    // A bug, so it still throws; the document must not stay held until the next restart.
    setDocumentStatus(
      db,
      claimed.id,
      { status: "failed", error: UNEXPECTED_FAILURE },
      deps.clock(),
    );
    throw error;
  }
};

const ingestSteps = async (
  db: Db,
  input: IngestInput,
  deps: IngestDeps,
): Promise<IngestResult> => {
  const detected = detectFile(input.filename, input.bytes, deps.maxUploadBytes);
  if (!detected.ok) return refuse(detected.error.code, detected.error.message);
  const sha256 = sha256Of(input.bytes);
  const sample = demoGate(sha256, deps, null);
  if (!sample.ok) return sample;
  await deps.files.write(sha256, detected.value.extension, input.bytes);
  const { document, alreadyIngested } = insertDocument(
    db,
    {
      sha256,
      filename: input.filename,
      mimeType: detected.value.mimeType,
      sizeBytes: input.bytes.length,
      source: input.source,
    },
    deps.clock(),
  );
  const file = {
    detected: detected.value,
    bytes: input.bytes,
    sample: sample.value,
  };
  return alreadyIngested
    ? ingestExisting(db, document, file, deps)
    : claimAndProcess(db, document, "queued", file, deps);
};

type LogFields = {
  readonly source: string;
  readonly filename: string;
  readonly sizeBytes: number;
  readonly startedAt: number;
};

/** AC-16: counts and outcome only; never the reason, the text or any extracted value. */
const logIngest = (
  fields: LogFields,
  result: IngestResult,
  deps: IngestDeps,
): void => {
  logEvent({
    event: "ingest",
    source: fields.source,
    filename: fields.filename,
    kind: result.ok ? result.value.kind : null,
    outcome: result.ok ? "done" : result.error.code,
    sizeBytes: fields.sizeBytes,
    alreadyIngested: result.ok && result.value.alreadyIngested,
    documentId: result.ok ? result.value.documentId : result.error.documentId,
    ms: deps.clock() - fields.startedAt,
  });
};

/** Checks, stores, extracts or parses, and audits one file (spec 0006, steps 1 to 10). */
export const ingestFile = async (
  db: Db,
  input: IngestInput,
  deps: IngestDeps,
): Promise<IngestResult> => {
  const startedAt = deps.clock();
  const named = { ...input, filename: baseName(input.filename) };
  const result = await ingestSteps(db, named, deps);
  logIngest(
    {
      source: input.source,
      filename: named.filename,
      sizeBytes: input.bytes.length,
      startedAt,
    },
    result,
    deps,
  );
  return result;
};

const retrySteps = async (
  db: Db,
  document: StoredDocument | null,
  documentId: number,
  deps: IngestDeps,
): Promise<IngestResult> => {
  if (document === null) {
    return refuse("not_failed", `document ${documentId} does not exist`);
  }
  if (document.status === "queued" || document.status === "extracting") {
    return refuse("in_progress", "already being processed", document.id);
  }
  if (document.status !== "failed") {
    return refuse(
      "not_failed",
      "only a failed document can be retried",
      document.id,
    );
  }
  const sample = demoGate(document.sha256, deps, document.id);
  if (!sample.ok) return sample;
  const bytes = await deps.files.read(document.sha256, extensionOf(document));
  if (bytes === null) return failWith(db, document, MISSING_FILE, deps);
  // A failed document's kind is still null, so the type is worked out again (AC-10).
  const detected = detectFile(document.filename, bytes, deps.maxUploadBytes);
  if (!detected.ok) return failWith(db, document, detected.error.message, deps);
  return claimAndProcess(
    db,
    document,
    "failed",
    { detected: detected.value, bytes, sample: sample.value },
    deps,
  );
};

/** Runs ingest again on a failed document from its saved file (spec 0006, AC-10). */
export const retryDocument = async (
  db: Db,
  documentId: number,
  deps: IngestDeps,
): Promise<IngestResult> => {
  const startedAt = deps.clock();
  const document = getDocument(db, documentId);
  const result = await retrySteps(db, document, documentId, deps);
  logIngest(
    {
      source: document?.source ?? "unknown",
      filename: document?.filename ?? "",
      sizeBytes: document?.sizeBytes ?? 0,
      startedAt,
    },
    result,
    deps,
  );
  return result;
};
