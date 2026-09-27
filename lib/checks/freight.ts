import type { Finding } from "@/lib/schemas/finding";
import { formatCents } from "@/lib/schemas/money";
import type { InvoiceRecord } from "@/lib/schemas/records";
import { moneyFinding } from "./action";
import type { AuditContext } from "./context";
import { amountsTerm, chargeLocator, evidenceItem, sumCents } from "./evidence";

/** Freight billed when the contract includes it (spec 0004, AC-12). */

const FREIGHT_TERMS_LOCATOR = "Freight terms";

const invoiceFindings = (
  invoice: InvoiceRecord,
  ctx: AuditContext,
): readonly Finding[] => {
  const contract = ctx.contractFor(invoice.supplierKey, invoice.invoiceDate);
  if (contract === null || contract.freightTerms !== "included") return [];
  const charges = invoice.charges.filter((charge) => charge.kind === "freight");
  const amounts = charges.map((charge) => charge.amountCents);
  const amountCents = sumCents(amounts);
  if (amountCents === 0) return [];
  return [
    moneyFinding(invoice, ctx, {
      check: "freight",
      detail: "freight",
      amountCents,
      title: "Freight billed, contract includes it",
      calculation: `${amountsTerm(amounts)} freight, included in contract price = ${formatCents(amountCents)}`,
      evidence: [
        ...charges.map((charge) =>
          evidenceItem(
            "Freight billed",
            formatCents(charge.amountCents),
            invoice,
            chargeLocator(charge.lineNo),
          ),
        ),
        evidenceItem(
          "Freight terms",
          "included",
          contract,
          contract.freightClause ?? FREIGHT_TERMS_LOCATOR,
        ),
      ],
    }),
  ];
};

export const checkFreight = (
  originals: readonly InvoiceRecord[],
  ctx: AuditContext,
): readonly Finding[] =>
  originals.flatMap((invoice) => invoiceFindings(invoice, ctx));
