import type { EvidenceItem, Finding } from "@/lib/schemas/finding";
import type {
  AuditInput,
  InvoiceLineRecord,
  InvoiceRecord,
} from "@/lib/schemas/records";
import { buildContext, type AuditContext } from "./context";
import { EVIDENCE_LABEL, sumQuantities } from "./evidence";

/**
 * What the review screen draws for one finding's invoice (spec 0008, AC-4 to AC-6): the line
 * facts the checks compared against, and which figures the finding's own evidence says are wrong.
 */

export type LineView = InvoiceLineRecord & {
  /** Total received on the invoice's PO for this SKU; null with no PO or no receipts on it. */
  readonly receivedQuantity: number | null;
  /** The SKU's price in the contract in force on the invoice date, or null. */
  readonly contractPriceCents: number | null;
};

export type InvoiceView = {
  readonly invoice: InvoiceRecord;
  readonly lines: readonly LineView[];
};

export type LineFigure = "quantity" | "unitPrice";
export type HeaderField =
  "invoiceNumber" | "invoiceDate" | "poNumber" | "total";

/** A key in `lines` means the line is flagged, even when its set of marked figures is empty. */
export type Highlights = {
  readonly lines: ReadonlyMap<number, ReadonlySet<LineFigure>>;
  readonly charges: ReadonlySet<number>;
  readonly header: ReadonlySet<HeaderField>;
};

const receivedFor = (
  invoice: InvoiceRecord,
  sku: string,
  ctx: AuditContext,
): number | null =>
  invoice.poNumber === null || !ctx.poHasReceipts(invoice.poNumber)
    ? null
    : sumQuantities(
        ctx
          .receiptsFor(invoice.poNumber, sku)
          .map((receipt) => receipt.quantityReceived),
      );

/** The invoice behind a finding with its lines' received quantity and contract price. */
export const describeInvoiceLines = (
  input: AuditInput,
  invoiceDocumentId: number,
): InvoiceView | null => {
  const ctx = buildContext(input);
  const invoice = ctx.invoiceByDocumentId.get(invoiceDocumentId);
  if (invoice === undefined) return null;
  const contract = ctx.contractFor(invoice.supplierKey, invoice.invoiceDate);
  return {
    invoice,
    lines: invoice.lines.map((line) => ({
      ...line,
      receivedQuantity: receivedFor(invoice, line.sku, ctx),
      contractPriceCents:
        contract?.prices.find((price) => price.sku === line.sku)
          ?.unitPriceCents ?? null,
    })),
  };
};

/** What one evidence label points at on the invoice. Labels not listed are proof, not errors. */
type Mark =
  | { readonly on: "line"; readonly figure: LineFigure | null }
  | { readonly on: "charge" }
  | { readonly on: "header"; readonly field: HeaderField };

const MARKS: ReadonlyMap<string, Mark> = new Map<string, Mark>([
  [EVIDENCE_LABEL.billedUnitPrice, { on: "line", figure: "unitPrice" }],
  [EVIDENCE_LABEL.quantityBilled, { on: "line", figure: "quantity" }],
  [EVIDENCE_LABEL.billedSku, { on: "line", figure: null }],
  [EVIDENCE_LABEL.surchargeBilled, { on: "charge" }],
  [EVIDENCE_LABEL.freightBilled, { on: "charge" }],
  [EVIDENCE_LABEL.chargeBilled, { on: "charge" }],
  [EVIDENCE_LABEL.poNumber, { on: "header", field: "poNumber" }],
  [EVIDENCE_LABEL.invoiceNumber, { on: "header", field: "invoiceNumber" }],
  [EVIDENCE_LABEL.invoiceDate, { on: "header", field: "invoiceDate" }],
  [EVIDENCE_LABEL.invoiceTotal, { on: "header", field: "total" }],
]);

const LINE_LOCATOR = /^line (\d+)$/;
const CHARGE_LOCATOR = /^charge line (\d+)$/;

const numberIn = (pattern: RegExp, locator: string): number | null => {
  const match = pattern.exec(locator);
  return match ? Number(match[1]) : null;
};

const EMPTY: Highlights = {
  lines: new Map(),
  charges: new Set(),
  header: new Set(),
};

const withLine = (
  highlights: Highlights,
  lineNo: number,
  figure: LineFigure | null,
): Highlights => {
  const figures = highlights.lines.get(lineNo) ?? new Set<LineFigure>();
  return {
    ...highlights,
    lines: new Map([
      ...highlights.lines,
      [lineNo, figure === null ? figures : new Set([...figures, figure])],
    ]),
  };
};

const applyItem = (highlights: Highlights, item: EvidenceItem): Highlights => {
  const mark = MARKS.get(item.label);
  if (mark === undefined) return highlights;
  if (mark.on === "header") {
    return {
      ...highlights,
      header: new Set([...highlights.header, mark.field]),
    };
  }
  if (mark.on === "charge") {
    const lineNo = numberIn(CHARGE_LOCATOR, item.source.locator);
    return lineNo === null
      ? highlights
      : { ...highlights, charges: new Set([...highlights.charges, lineNo]) };
  }
  const lineNo = numberIn(LINE_LOCATOR, item.source.locator);
  return lineNo === null
    ? highlights
    : withLine(highlights, lineNo, mark.figure);
};

/** Which invoice lines, charges and header fields the finding's own evidence says are wrong. */
export const highlightsFor = (finding: Finding): Highlights =>
  finding.evidence
    .filter((item) => item.source.documentId === finding.invoiceDocumentId)
    .reduce(applyItem, EMPTY);

/** Each distinct "<filename>, <locator>" in evidence order, joined with " · ". */
export const citationsFor = (finding: Finding): string =>
  [
    ...new Set(
      finding.evidence.map(
        (item) => `${item.source.filename}, ${item.source.locator}`,
      ),
    ),
  ].join(" · ");
