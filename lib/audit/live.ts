import "server-only";
import { runChecks, type AuditSummary } from "@/lib/checks";
import { resetAll } from "@/lib/db/admin";
import { listFindings, type FindingView } from "@/lib/db/audit";
import type { Db } from "@/lib/db/client";
import { setDocumentStatus } from "@/lib/db/documents";
import {
  extractDocument,
  type ExtractDeps,
  type ExtractedDocument,
} from "@/lib/extract/extract";
import { parsePaymentsCsv, parseReceiptsCsv } from "@/lib/ingest/csv";
import {
  toContractRecord,
  toInvoiceRecord,
  toPaymentRecord,
  toPurchaseOrderRecord,
  toReceiptRecord,
} from "@/lib/schemas/convert";
import type { PaymentCsvRow, ReceiptCsvRow } from "@/lib/schemas/extraction";
import { BRIEF_INVOICED_TOTAL_CENTS } from "@/lib/schemas/fixtures/brief-sample";
import { briefSampleRecords } from "@/lib/schemas/fixtures/brief-sample-records";
import type { AuditInput, DocumentRef } from "@/lib/schemas/records";
import { err, ok, orThrow, type Result } from "@/lib/schemas/result";
import type { SampleManifestEntry } from "@/lib/schemas/sample-manifest";
import {
  compareFindings,
  compareKinds,
  compareRecords,
  type Mismatch,
} from "./compare";
import { runAudit, type AuditRunResult } from "./run";
import {
  saveAuditInput,
  storeManifestDocuments,
  type ManifestFiles,
  type RefFor,
} from "./store";

/**
 * The live run (spec 0005, AC-9 to AC-11): the real model reads the 12 sample PDFs, the two
 * CSVs are parsed, and the result must match offline mode to the cent. Nothing is stored unless
 * every document is read cleanly, and then everything is stored in one transaction.
 */

/** Documents extracted at once. */
export const LIVE_CONCURRENCY = 4;

/** The brief's headline figures, the acceptance test (AGENTS.md). */
export const BRIEF_SUMMARY = {
  findingCount: 8,
  recoverableCents: 976_685,
  recoverableShare: "18.1%",
  invoicedTotalCents: BRIEF_INVOICED_TOTAL_CENTS,
} as const satisfies Partial<AuditSummary>;

export type LiveCsv = {
  readonly receipts: readonly ReceiptCsvRow[];
  readonly payments: readonly PaymentCsvRow[];
};

export type DocumentOutcome = {
  readonly filename: string;
  readonly result: Result<string>;
};

export type StoredLiveRun = AuditRunResult & {
  readonly refFor: RefFor;
  readonly records: AuditInput;
  readonly findings: readonly FindingView[];
};

export type LiveReport = {
  readonly outcomes: readonly DocumentOutcome[];
  readonly extracted: ReadonlyMap<string, ExtractedDocument>;
  readonly stored: StoredLiveRun | null;
  readonly mismatches: readonly Mismatch[];
};

const isPdf = (file: SampleManifestEntry): boolean =>
  file.mimeType === "application/pdf";

const csvFile = (
  manifest: ManifestFiles,
  kind: "receipts_csv" | "payments_csv",
): SampleManifestEntry => {
  const found = manifest.files.find((file) => file.kind === kind);
  if (!found) throw new Error(`the manifest lists no ${kind}`);
  return found;
};

/** One extracted document as its record, under its real document ref. */
const addDocumentRecord = (
  input: AuditInput,
  doc: ExtractedDocument,
  ref: DocumentRef,
): AuditInput => {
  const context = ref.filename;
  switch (doc.kind) {
    case "invoice":
      return {
        ...input,
        invoices: [
          ...input.invoices,
          orThrow(context, toInvoiceRecord(doc.extraction, ref)),
        ],
      };
    case "contract":
      return {
        ...input,
        contracts: [
          ...input.contracts,
          orThrow(context, toContractRecord(doc.extraction, ref)),
        ],
      };
    case "purchase_order":
      return {
        ...input,
        purchaseOrders: [
          ...input.purchaseOrders,
          orThrow(context, toPurchaseOrderRecord(doc.extraction, ref)),
        ],
      };
  }
};

const extractedFor = (
  extracted: ReadonlyMap<string, ExtractedDocument>,
  filename: string,
): ExtractedDocument => {
  const doc = extracted.get(filename);
  if (!doc) throw new Error(`${filename} was not extracted`);
  return doc;
};

/** The live records: every extraction and CSV row converted under the stored refs. */
const liveRecords = (
  manifest: ManifestFiles,
  extracted: ReadonlyMap<string, ExtractedDocument>,
  csv: LiveCsv,
  refFor: RefFor,
): AuditInput => {
  const receiptsRef = refFor(csvFile(manifest, "receipts_csv").filename);
  const paymentsRef = refFor(csvFile(manifest, "payments_csv").filename);
  const empty: AuditInput = {
    invoices: [],
    contracts: [],
    purchaseOrders: [],
    receipts: csv.receipts.map((row, index) =>
      orThrow(
        receiptsRef.filename,
        toReceiptRecord(row, receiptsRef, index + 1),
      ),
    ),
    payments: csv.payments.map((row, index) =>
      orThrow(
        paymentsRef.filename,
        toPaymentRecord(row, paymentsRef, index + 1),
      ),
    ),
  };
  return manifest.files
    .filter(isPdf)
    .reduce(
      (input, file) =>
        addDocumentRecord(
          input,
          extractedFor(extracted, file.filename),
          refFor(file.filename),
        ),
      empty,
    );
};

/**
 * The AC-10 transaction: reset, store the 14 documents in manifest order (so ids match the
 * offline run), record each PDF's text layer flag, save the records and run the checks. A throw
 * rolls it all back; nested `lib/db` transactions run as savepoints (see `sample.ts`).
 */
export const storeLiveSample = (
  db: Db,
  clock: () => number,
  manifest: ManifestFiles,
  extracted: ReadonlyMap<string, ExtractedDocument>,
  csv: LiveCsv,
): StoredLiveRun =>
  db.transaction(() => {
    const now = clock();
    resetAll(db);
    const refFor = storeManifestDocuments(db, manifest, now);
    manifest.files.filter(isPdf).forEach((file) =>
      orThrow(
        file.filename,
        setDocumentStatus(
          db,
          refFor(file.filename).documentId,
          {
            status: "extracting",
            hasTextLayer: extractedFor(extracted, file.filename).hasTextLayer,
          },
          now,
        ),
      ),
    );
    const records = liveRecords(manifest, extracted, csv, refFor);
    saveAuditInput(
      db,
      records,
      {
        receipts: refFor(csvFile(manifest, "receipts_csv").filename),
        payments: refFor(csvFile(manifest, "payments_csv").filename),
      },
      now,
    );
    const run = runAudit(db, clock);
    return { ...run, refFor, records, findings: listFindings(db) };
  });

/** Runs `task` over `items` with at most `limit` running at once, keeping input order. */
const mapWithLimit = async <T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<R>,
): Promise<readonly R[]> => {
  const results: R[] = new Array(items.length);
  const next = { index: 0 };
  const worker = async (): Promise<void> => {
    while (next.index < items.length) {
      const index = next.index++;
      results[index] = await task(items[index]);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return results;
};

/** Parses a CSV and checks every row converts, before anything is stored. */
const readCsv = <T>(
  filename: string,
  text: string,
  parse: (text: string) => Result<readonly T[]>,
  convert: (row: T, ref: DocumentRef, rowNo: number) => Result<unknown>,
): Result<readonly T[]> => {
  const parsed = parse(text);
  if (!parsed.ok) return err(`${filename}: ${parsed.error}`);
  const failed = parsed.value
    .map((row, index) => convert(row, { documentId: 0, filename }, index + 1))
    .find((result) => !result.ok);
  return failed && !failed.ok ? err(`${filename}: ${failed.error}`) : parsed;
};

const summaryMismatches = (summary: AuditSummary): readonly Mismatch[] =>
  (Object.keys(BRIEF_SUMMARY) as (keyof typeof BRIEF_SUMMARY)[]).flatMap(
    (field) =>
      summary[field] === BRIEF_SUMMARY[field]
        ? []
        : [
            {
              filename: "summary",
              path: field,
              live: String(summary[field]),
              offline: String(BRIEF_SUMMARY[field]),
            },
          ],
  );

/** Everything the live run must match (AC-9): kinds, records, findings and the headline. */
const liveMismatches = (
  manifest: ManifestFiles,
  extracted: ReadonlyMap<string, ExtractedDocument>,
  stored: StoredLiveRun,
): readonly Mismatch[] => {
  const offline = briefSampleRecords(stored.refFor);
  const filenames = new Map(
    manifest.files.map((file) => [
      stored.refFor(file.filename).documentId,
      file.filename,
    ]),
  );
  const filenameOf = (documentId: number): string =>
    filenames.get(documentId) ?? `document ${documentId}`;
  return [
    ...compareKinds(
      manifest.files.filter(isPdf),
      new Map([...extracted].map(([filename, doc]) => [filename, doc.kind])),
    ),
    ...compareRecords(stored.records, offline),
    ...compareFindings(stored.findings, runChecks(offline), filenameOf),
    ...summaryMismatches(stored.summary),
  ];
};

export type LiveRunDeps = {
  readonly extract: ExtractDeps;
  readonly readFile: (filename: string) => Promise<Uint8Array>;
  readonly clock?: () => number;
};

/**
 * `pnpm audit:live`: extracts every sample PDF (4 at a time), parses both CSVs, and stores the
 * run only when every document read cleanly. Mismatches still store the run (AC-10).
 */
export const runLiveAudit = async (
  db: Db,
  manifest: ManifestFiles,
  deps: LiveRunDeps,
): Promise<LiveReport> => {
  const pdfs = manifest.files.filter(isPdf);
  const results = await mapWithLimit(pdfs, LIVE_CONCURRENCY, async (file) => ({
    filename: file.filename,
    result: await extractDocument(
      { filename: file.filename, bytes: await deps.readFile(file.filename) },
      deps.extract,
    ),
  }));
  const decode = async (filename: string) =>
    new TextDecoder().decode(await deps.readFile(filename));
  const receiptsName = csvFile(manifest, "receipts_csv").filename;
  const paymentsName = csvFile(manifest, "payments_csv").filename;
  const receipts = readCsv(
    receiptsName,
    await decode(receiptsName),
    parseReceiptsCsv,
    toReceiptRecord,
  );
  const payments = readCsv(
    paymentsName,
    await decode(paymentsName),
    parsePaymentsCsv,
    toPaymentRecord,
  );

  const extracted = new Map(
    results.flatMap(({ filename, result }) =>
      result.ok ? [[filename, result.value] as const] : [],
    ),
  );
  const outcomes: readonly DocumentOutcome[] = [
    ...results.map(({ filename, result }) => ({
      filename,
      result: result.ok
        ? ok(`${result.value.kind}, attempts ${result.value.attempts}`)
        : err(result.error),
    })),
    {
      filename: receiptsName,
      result: receipts.ok ? ok(`${receipts.value.length} rows`) : receipts,
    },
    {
      filename: paymentsName,
      result: payments.ok ? ok(`${payments.value.length} rows`) : payments,
    },
  ];

  if (!receipts.ok || !payments.ok || extracted.size !== pdfs.length) {
    return { outcomes, extracted, stored: null, mismatches: [] };
  }
  const stored = storeLiveSample(
    db,
    deps.clock ?? Date.now,
    manifest,
    extracted,
    {
      receipts: receipts.value,
      payments: payments.value,
    },
  );
  return {
    outcomes,
    extracted,
    stored,
    mismatches: liveMismatches(manifest, extracted, stored),
  };
};
