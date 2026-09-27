import { formatCents } from "../../../lib/schemas/money";
import type { PurchaseOrderExtraction } from "../../../lib/schemas/extraction";
import { cents, formatLongDate, formatMoney, formatQuantity } from "../format";
import { BUYER, supplierParty } from "../parties";
import {
  footer,
  letterhead,
  partyBlock,
  rightText,
  table,
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

const COLUMNS: readonly Column[] = [
  { header: "SKU", x: MARGIN + 6, align: "left" },
  { header: "Description", x: 140, align: "left" },
  { header: "Qty", x: 390, align: "right" },
  { header: "Unit price", x: 470, align: "right" },
  { header: "Line total", x: CONTENT_RIGHT - 6, align: "right" },
];

type PurchaseOrderLine = PurchaseOrderExtraction["lines"][number];

/** Quantity × unit price in cents; display only, no check reads it (spec 0003). */
const lineTotalCents = (line: PurchaseOrderLine): number | null =>
  line.unitPrice === null ? null : line.quantity * cents(line.unitPrice);

/**
 * A purchase order (spec 0003): issued by the buyer to the supplier, every fixture field in
 * printed form, line totals and the PO total computed in cents.
 */
export const layoutPurchaseOrder = (
  order: PurchaseOrderExtraction,
  measure: Measure,
): LaidOutDocument => {
  const supplier = supplierParty(order.supplierName);
  const totals = order.lines.map(lineTotalCents);
  const orderTotal = totals.reduce<number>(
    (sum, value) => sum + (value ?? 0),
    0,
  );
  const lines = table(
    measure,
    COLUMNS,
    order.lines.map((line, index) => {
      const total = totals[index];
      return [
        line.sku,
        line.description,
        formatQuantity(line.quantity),
        line.unitPrice === null ? "" : formatMoney(line.unitPrice),
        total === null ? "" : formatCents(total),
      ];
    }),
    270,
  );

  const page: readonly DrawOp[] = [
    ...letterhead(measure, BUYER, "PURCHASE ORDER"),
    ...partyBlock(MARGIN, 176, "Vendor", supplier),
    ...partyBlock(210, 176, "Ship to", BUYER),
    ...textLines(380, 176, [
      `PO number: ${order.poNumber}`,
      `Order date: ${formatLongDate(order.orderDate)}`,
      `Currency: ${order.currency}`,
    ]),
    ...lines.ops,
    rightText(
      measure,
      CONTENT_RIGHT - 6,
      lines.bottom + 26,
      `PO total ${formatCents(orderTotal)}`,
      { weight: "bold", size: 12 },
    ),
    ...textLines(MARGIN, lines.bottom + 70, [
      `Please quote PO number ${order.poNumber} on every invoice and delivery note.`,
      `Authorized by ${BUYER.name} purchasing, ${BUYER.email}, phone ${BUYER.phone}`,
    ]),
    ...footer(measure),
  ];

  return {
    info: {
      title: order.poNumber,
      author: BUYER.name,
      date: order.orderDate,
    },
    pages: [page],
  };
};
