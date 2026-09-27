import type { DocumentKind } from "../../lib/schemas/enums";
import {
  PaymentCsvRow,
  ReceiptCsvRow,
  type ContractExtraction,
  type InvoiceExtraction,
  type PurchaseOrderExtraction,
} from "../../lib/schemas/extraction";
import {
  BRIEF_SAMPLE,
  type SampleCsv,
  type SampleDocument,
} from "../../lib/schemas/fixtures/brief-sample";
import { ok, type Result } from "../../lib/schemas/result";
import { toCsv, toCsvRows } from "./csv";
import { layoutContract } from "./layout/contract";
import { layoutInvoice } from "./layout/invoice";
import type { LaidOutDocument, Measure } from "./layout/page";
import { layoutPurchaseOrder } from "./layout/purchase-order";
import {
  buildManifest,
  manifestBytes,
  MANIFEST_FILENAME,
  type DataFile,
} from "./manifest";
import { createMeasure, paintPdf } from "./paint-pdf";
import { SCAN_FILENAME, SCAN_STAMP_TEXT } from "./parties";
import { paintScan } from "./scan";
import { validateSample, type BriefSample } from "./validate";

export type RenderedFile = {
  readonly filename: string;
  readonly bytes: Uint8Array;
};

export const RECEIPTS_HEADER = ReceiptCsvRow.keyof().options;
export const PAYMENTS_HEADER = PaymentCsvRow.keyof().options;

const textPdf = async <T>(
  doc: SampleDocument<T>,
  kind: DocumentKind,
  layout: (extraction: T, measure: Measure) => LaidOutDocument,
  measure: Measure,
): Promise<DataFile> => ({
  filename: doc.filename,
  kind,
  hasTextLayer: true,
  bytes: await paintPdf(layout(doc.extraction, measure)),
});

const invoiceFile = async (
  doc: SampleDocument<InvoiceExtraction>,
  measure: Measure,
): Promise<DataFile> =>
  doc.filename === SCAN_FILENAME
    ? {
        filename: doc.filename,
        kind: "invoice",
        hasTextLayer: false,
        bytes: await paintScan(
          layoutInvoice(doc.extraction, measure, SCAN_STAMP_TEXT),
        ),
      }
    : textPdf(doc, "invoice", layoutInvoice, measure);

const csvFile = <K extends string>(
  csv: SampleCsv<Readonly<Record<K, string>>>,
  kind: DocumentKind,
  header: readonly K[],
): DataFile => ({
  filename: csv.filename,
  kind,
  hasTextLayer: null,
  bytes: new TextEncoder().encode(toCsv(header, toCsvRows(header, csv.rows))),
});

/** Runs async steps one after another (painters are never used concurrently, spec 0003). */
const sequence = async <T>(
  steps: readonly (() => Promise<T>)[],
): Promise<readonly T[]> =>
  steps.reduce<Promise<readonly T[]>>(
    async (done, step) => [...(await done), await step()],
    Promise.resolve([]),
  );

const renderDataFiles = (
  sample: BriefSample,
  measure: Measure,
): Promise<readonly DataFile[]> =>
  sequence<DataFile>([
    ...sample.contracts.map(
      (doc: SampleDocument<ContractExtraction>) => () =>
        textPdf(doc, "contract", layoutContract, measure),
    ),
    ...sample.purchaseOrders.map(
      (doc: SampleDocument<PurchaseOrderExtraction>) => () =>
        textPdf(doc, "purchase_order", layoutPurchaseOrder, measure),
    ),
    ...sample.invoices.map((doc) => () => invoiceFile(doc, measure)),
    async () => csvFile(sample.receipts, "receipts_csv", RECEIPTS_HEADER),
    async () => csvFile(sample.payments, "payments_csv", PAYMENTS_HEADER),
  ]);

/**
 * Every output file in memory, no disk writes (spec 0003): the fixture is validated first, so a
 * bad figure stops the run before anything is rendered (AC-2).
 */
export const renderSample = async (
  sample: BriefSample = BRIEF_SAMPLE,
): Promise<Result<readonly RenderedFile[]>> => {
  const valid = validateSample(sample);
  if (!valid.ok) return valid;
  const files = await renderDataFiles(sample, createMeasure());
  const manifest = buildManifest(files);
  if (!manifest.ok) return manifest;
  return ok([
    ...files.map(({ filename, bytes }) => ({ filename, bytes })),
    { filename: MANIFEST_FILENAME, bytes: manifestBytes(manifest.value) },
  ]);
};
