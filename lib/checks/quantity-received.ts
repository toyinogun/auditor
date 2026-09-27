import type { EvidenceItem, Finding } from "@/lib/schemas/finding";
import { formatCents } from "@/lib/schemas/money";
import type {
  InvoiceLineRecord,
  InvoiceRecord,
  PurchaseOrderRecord,
} from "@/lib/schemas/records";
import { moneyFinding, reviewFinding } from "./action";
import type { AuditContext } from "./context";
import { byInvoiceOrder } from "./duplicate";
import {
  evidenceItem,
  formatQuantity,
  INVOICE_LABEL,
  lineLocator,
  MINUS,
  rowLocator,
  sumCents,
  TIMES,
} from "./evidence";

/**
 * Units billed but not received, counted across every invoice on a PO (spec 0004, AC-10).
 * Each invoice is flagged only for the units that push the running billed total past received.
 */

type BilledLine = {
  readonly invoice: InvoiceRecord;
  readonly line: InvoiceLineRecord;
};

type PriceUsed = { readonly cents: number; readonly evidence: EvidenceItem };

const linesOf = (invoice: InvoiceRecord, sku: string): readonly BilledLine[] =>
  invoice.lines
    .filter((line) => line.sku === sku)
    .map((line) => ({ invoice, line }));

const quantityOf = (lines: readonly BilledLine[]): number =>
  sumCents(lines.map(({ line }) => line.quantity));

/** Contract price in force for the SKU, else the lowest billed price on this invoice. */
const priceUsed = (
  invoice: InvoiceRecord,
  here: readonly BilledLine[],
  ctx: AuditContext,
): PriceUsed => {
  const contract = ctx.contractFor(invoice.supplierKey, invoice.invoiceDate);
  const price = contract?.prices.find((p) => p.sku === here[0].line.sku);
  if (contract && price) {
    return {
      cents: price.unitPriceCents,
      evidence: evidenceItem(
        "Price used",
        formatCents(price.unitPriceCents),
        contract,
        price.clause,
      ),
    };
  }
  const [lowest] = [...here].sort(
    (a, b) => a.line.unitPriceCents - b.line.unitPriceCents,
  );
  return {
    cents: lowest.line.unitPriceCents,
    evidence: evidenceItem(
      "Price used",
      formatCents(lowest.line.unitPriceCents),
      invoice,
      lineLocator(lowest.line.lineNo),
    ),
  };
};

/** The earlier line that first took the running billed total past received. */
const crossingLine = (
  earlier: readonly BilledLine[],
  received: number,
): BilledLine | undefined =>
  earlier.find(
    (_, index) => quantityOf(earlier.slice(0, index + 1)) > received,
  );

const receivedEvidence = (
  po: PurchaseOrderRecord,
  sku: string,
  ctx: AuditContext,
): readonly EvidenceItem[] => {
  const receipts = ctx.receiptsFor(po.poNumber, sku);
  if (receipts.length > 0) {
    return receipts.map((receipt) =>
      evidenceItem(
        "Quantity received",
        formatQuantity(receipt.quantityReceived),
        receipt,
        rowLocator(receipt.rowNo),
      ),
    );
  }
  const poLine = po.lines.find((line) => line.sku === sku);
  return [
    evidenceItem(
      "Quantity received",
      `0, no receipt row for ${sku} on ${po.poNumber}`,
      po,
      poLine ? lineLocator(poLine.lineNo) : INVOICE_LABEL.po,
    ),
  ];
};

const skuFinding = (
  po: PurchaseOrderRecord,
  invoice: InvoiceRecord,
  earlierInvoices: readonly InvoiceRecord[],
  sku: string,
  ctx: AuditContext,
): Finding | null => {
  const here = linesOf(invoice, sku);
  const earlier = earlierInvoices.flatMap((prior) => linesOf(prior, sku));
  const received = sumCents(
    ctx.receiptsFor(po.poNumber, sku).map((r) => r.quantityReceived),
  );
  const billedBefore = quantityOf(earlier);
  const billedToDate = billedBefore + quantityOf(here);
  const alreadyOver = Math.max(0, billedBefore - received);
  const excess = Math.max(0, billedToDate - received) - alreadyOver;
  if (excess <= 0) return null;

  const price = priceUsed(invoice, here, ctx);
  const amountCents = excess * price.cents;
  const crossing =
    alreadyOver > 0 ? crossingLine(earlier, received) : undefined;
  const flaggedTerm =
    alreadyOver > 0
      ? ` ${MINUS} ${formatQuantity(alreadyOver)} already flagged`
      : "";
  return moneyFinding(invoice, ctx, {
    check: "quantity_received",
    detail: sku,
    amountCents,
    title: `${formatQuantity(excess)} ${TIMES} ${here[0].line.description} billed, not received`,
    calculation: `(${formatQuantity(billedToDate)} billed ${MINUS} ${formatQuantity(received)} received${flaggedTerm}) ${TIMES} ${formatCents(price.cents)} = ${formatCents(amountCents)}`,
    evidence: [
      ...here.map(({ line }) =>
        evidenceItem(
          "Quantity billed",
          formatQuantity(line.quantity),
          invoice,
          lineLocator(line.lineNo),
        ),
      ),
      ...earlier.map(({ invoice: prior, line }) =>
        evidenceItem(
          `Billed earlier on ${po.poNumber}`,
          `${formatQuantity(line.quantity)} on ${prior.invoiceNumber}`,
          prior,
          lineLocator(line.lineNo),
        ),
      ),
      ...receivedEvidence(po, sku, ctx),
      ...(crossing
        ? [
            evidenceItem(
              `Already over on ${po.poNumber}`,
              formatQuantity(alreadyOver),
              crossing.invoice,
              lineLocator(crossing.line.lineNo),
            ),
          ]
        : []),
      price.evidence,
    ],
  });
};

const noReceiptFinding = (invoice: InvoiceRecord, poNumber: string): Finding =>
  reviewFinding(invoice, {
    check: "quantity_received",
    detail: "receipt",
    title: `No goods receipt found for ${poNumber}`,
    evidence: [evidenceItem("PO number", poNumber, invoice, INVOICE_LABEL.po)],
  });

const poFindings = (
  po: PurchaseOrderRecord,
  invoices: readonly InvoiceRecord[],
  ctx: AuditContext,
): readonly Finding[] => {
  const ordered = [...invoices].sort(byInvoiceOrder);
  if (!ctx.poHasReceipts(po.poNumber)) {
    return ordered.map((invoice) => noReceiptFinding(invoice, po.poNumber));
  }
  return ordered.flatMap((invoice, index) =>
    [...new Set(invoice.lines.map((line) => line.sku))].flatMap((sku) => {
      const finding = skuFinding(
        po,
        invoice,
        ordered.slice(0, index),
        sku,
        ctx,
      );
      return finding === null ? [] : [finding];
    }),
  );
};

export const checkQuantityReceived = (
  originals: readonly InvoiceRecord[],
  ctx: AuditContext,
): readonly Finding[] =>
  [...Map.groupBy(originals, (invoice) => invoice.poNumber)].flatMap(
    ([poNumber, invoices]) => {
      const po = poNumber === null ? undefined : ctx.poByNumber.get(poNumber);
      return po === undefined ? [] : poFindings(po, invoices, ctx);
    },
  );
