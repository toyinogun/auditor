import type { InvoiceExtraction } from "../../../lib/schemas/extraction";
import {
  dueDate,
  formatLongDate,
  formatMoney,
  formatQuantity,
} from "../format";
import { BUYER, PAYMENT_TERMS_TEXT, supplierParty } from "../parties";
import {
  footer,
  LINE_HEIGHT,
  letterhead,
  MUTED,
  partyBlock,
  rightText,
  rule,
  table,
  text,
  textLines,
  type Column,
} from "./common";
import {
  CONTENT_RIGHT,
  MARGIN,
  type DrawOp,
  type LaidOutDocument,
  type Measure,
} from "./page";

const DETAILS_X = 360;

const COLUMNS: readonly Column[] = [
  { header: "SKU", x: MARGIN + 6, align: "left" },
  { header: "Description", x: 140, align: "left" },
  { header: "Qty", x: 390, align: "right" },
  { header: "Unit price", x: 470, align: "right" },
  { header: "Amount", x: CONTENT_RIGHT - 6, align: "right" },
];

const STAMP_COLOR = "#b3261e";

/**
 * An invoice (spec 0003): every fixture field in printed form, Net 30 terms and a due date, and
 * an optional stamp (the NL88310 reminder). Labels and values are single text ops so a text read
 * back keeps them together.
 */
export const layoutInvoice = (
  invoice: InvoiceExtraction,
  measure: Measure,
  stamp: string | null = null,
): LaidOutDocument => {
  const supplier = supplierParty(invoice.supplierName);
  const details = [
    `Invoice number: ${invoice.invoiceNumber}`,
    `Invoice date: ${formatLongDate(invoice.invoiceDate)}`,
    PAYMENT_TERMS_TEXT,
    `Due date: ${formatLongDate(dueDate(invoice.invoiceDate))}`,
    ...(invoice.poNumber === null ? [] : [`PO number: ${invoice.poNumber}`]),
    `Currency: ${invoice.currency}`,
  ];
  const lines = table(
    measure,
    COLUMNS,
    invoice.lines.map((line) => [
      line.sku,
      line.description,
      formatQuantity(line.quantity),
      formatMoney(line.unitPrice),
      formatMoney(line.amount),
    ]),
    270,
  );
  const totals = [
    `Subtotal ${formatMoney(invoice.subtotal)}`,
    ...invoice.charges.map(
      (charge) => `${charge.label} ${formatMoney(charge.amount)}`,
    ),
  ];
  const totalsTop = lines.bottom + 22;
  const totalTop = totalsTop + totals.length * LINE_HEIGHT + 8;
  const remitTop = totalTop + 48;

  const stampOps: readonly DrawOp[] =
    stamp === null
      ? []
      : [
          {
            kind: "stamp",
            cx: 380,
            cy: remitTop + 90,
            text: stamp,
            size: 17,
            angle: -9,
            color: STAMP_COLOR,
          },
        ];

  const page: readonly DrawOp[] = [
    ...letterhead(measure, supplier, "INVOICE"),
    ...partyBlock(MARGIN, 176, "Bill to", BUYER),
    ...textLines(DETAILS_X, 176, details),
    ...lines.ops,
    ...totals.map((line, index) =>
      rightText(
        measure,
        CONTENT_RIGHT - 6,
        totalsTop + index * LINE_HEIGHT,
        line,
      ),
    ),
    rule(totalTop - 12, DETAILS_X, CONTENT_RIGHT),
    rightText(
      measure,
      CONTENT_RIGHT - 6,
      totalTop + 4,
      `Total ${formatMoney(invoice.total)}`,
      { weight: "bold", size: 12 },
    ),
    text(MARGIN, remitTop, "Remit to", { weight: "bold", color: MUTED }),
    ...textLines(MARGIN, remitTop + LINE_HEIGHT, [
      `${supplier.name}, ${supplier.addressLines.join(", ")}`,
      `Questions about this invoice: ${supplier.email}, phone ${supplier.phone}`,
    ]),
    ...stampOps,
    ...footer(measure),
  ];

  return {
    info: {
      title: invoice.invoiceNumber,
      author: invoice.supplierName,
      date: invoice.invoiceDate,
    },
    pages: [page],
  };
};
