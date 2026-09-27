import type { Finding } from "@/lib/schemas/finding";
import { formatCents } from "@/lib/schemas/money";
import type {
  ContractPriceRecord,
  ContractRecord,
  InvoiceLineRecord,
  InvoiceRecord,
} from "@/lib/schemas/records";
import { moneyFinding } from "./action";
import type { AuditContext } from "./context";
import {
  evidenceItem,
  formatQuantity,
  lineLocator,
  MINUS,
  sumCents,
  TIMES,
  EVIDENCE_LABEL,
} from "./evidence";

/** Lines billed above the contract price, one finding per invoice and SKU (spec 0004, AC-13). */

const overchargeCents = (
  line: InvoiceLineRecord,
  price: ContractPriceRecord,
): number => (line.unitPriceCents - price.unitPriceCents) * line.quantity;

const skuFinding = (
  invoice: InvoiceRecord,
  contract: ContractRecord,
  price: ContractPriceRecord,
  lines: readonly InvoiceLineRecord[],
  ctx: AuditContext,
): Finding | null => {
  const over = lines.filter(
    (line) => line.unitPriceCents > price.unitPriceCents,
  );
  if (over.length === 0) return null;
  const amountCents = sumCents(
    over.map((line) => overchargeCents(line, price)),
  );
  const terms = over.map(
    (line) =>
      `(${formatCents(line.unitPriceCents)} ${MINUS} ${formatCents(price.unitPriceCents)}) ${TIMES} ${formatQuantity(line.quantity)}`,
  );
  return moneyFinding(invoice, ctx, {
    check: "contract_price",
    detail: price.sku,
    amountCents,
    title: `${over[0].description} billed above contract price`,
    calculation: `${terms.join(" + ")} = ${formatCents(amountCents)}`,
    evidence: [
      ...over.flatMap((line) => [
        evidenceItem(
          EVIDENCE_LABEL.billedUnitPrice,
          formatCents(line.unitPriceCents),
          invoice,
          lineLocator(line.lineNo),
        ),
        evidenceItem(
          EVIDENCE_LABEL.quantityBilled,
          formatQuantity(line.quantity),
          invoice,
          lineLocator(line.lineNo),
        ),
      ]),
      evidenceItem(
        EVIDENCE_LABEL.contractPrice,
        formatCents(price.unitPriceCents),
        contract,
        price.clause,
      ),
    ],
  });
};

const invoiceFindings = (
  invoice: InvoiceRecord,
  ctx: AuditContext,
): readonly Finding[] => {
  const contract = ctx.contractFor(invoice.supplierKey, invoice.invoiceDate);
  if (contract === null) return [];
  return [...Map.groupBy(invoice.lines, (line) => line.sku)].flatMap(
    ([sku, lines]) => {
      const price = contract.prices.find((p) => p.sku === sku);
      const finding =
        price === undefined
          ? null
          : skuFinding(invoice, contract, price, lines, ctx);
      return finding === null ? [] : [finding];
    },
  );
};

export const checkContractPrice = (
  originals: readonly InvoiceRecord[],
  ctx: AuditContext,
): readonly Finding[] =>
  originals.flatMap((invoice) => invoiceFindings(invoice, ctx));
