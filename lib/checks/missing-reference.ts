import type { Finding } from "@/lib/schemas/finding";
import type { InvoiceRecord } from "@/lib/schemas/records";
import { reviewFinding } from "./action";
import type { AuditContext } from "./context";
import {
  evidenceItem,
  INVOICE_LABEL,
  lineLocator,
  EVIDENCE_LABEL,
} from "./evidence";

/** $0 review findings for a missing PO, contract or contract price (spec 0004, AC-9). */

const poFindings = (
  invoice: InvoiceRecord,
  ctx: AuditContext,
): readonly Finding[] => {
  const { poNumber } = invoice;
  if (poNumber !== null && ctx.poByNumber.has(poNumber)) return [];
  return [
    reviewFinding(invoice, {
      check: "missing_reference",
      detail: "po",
      title: poNumber === null ? "No PO" : `PO ${poNumber} not found`,
      evidence: [
        evidenceItem(
          EVIDENCE_LABEL.poNumber,
          poNumber ?? "none",
          invoice,
          INVOICE_LABEL.po,
        ),
      ],
    }),
  ];
};

const contractFindings = (
  invoice: InvoiceRecord,
  ctx: AuditContext,
): readonly Finding[] => {
  const contract = ctx.contractFor(invoice.supplierKey, invoice.invoiceDate);
  if (contract === null) {
    return [
      reviewFinding(invoice, {
        check: "missing_reference",
        detail: "contract",
        title: `No contract in force on ${invoice.invoiceDate}`,
        evidence: [
          evidenceItem(
            EVIDENCE_LABEL.invoiceDate,
            invoice.invoiceDate,
            invoice,
            INVOICE_LABEL.date,
          ),
        ],
      }),
    ];
  }
  const priced = new Set(contract.prices.map((price) => price.sku));
  return [...Map.groupBy(invoice.lines, (line) => line.sku)]
    .filter(([sku]) => !priced.has(sku))
    .map(([sku, lines]) =>
      reviewFinding(invoice, {
        check: "missing_reference",
        detail: sku,
        title: `No contract price for ${sku}`,
        evidence: lines.map((line) =>
          evidenceItem(
            EVIDENCE_LABEL.billedSku,
            sku,
            invoice,
            lineLocator(line.lineNo),
          ),
        ),
      }),
    );
};

export const checkMissingReferences = (
  originals: readonly InvoiceRecord[],
  ctx: AuditContext,
): readonly Finding[] =>
  originals.flatMap((invoice) => [
    ...poFindings(invoice, ctx),
    ...contractFindings(invoice, ctx),
  ]);
