import type { SurchargeType } from "@/lib/schemas/enums";
import type { EvidenceItem, Finding } from "@/lib/schemas/finding";
import { formatBps, formatCents, percentOfCents } from "@/lib/schemas/money";
import type {
  ContractRecord,
  InvoiceChargeRecord,
  InvoiceRecord,
} from "@/lib/schemas/records";
import { moneyFinding, reviewFinding } from "./action";
import type { AuditContext } from "./context";
import {
  amountsTerm,
  chargeLocator,
  evidenceItem,
  INVOICE_LABEL,
  MINUS,
  sumCents,
  TIMES,
} from "./evidence";

/** Surcharges not permitted or above their cap, and unrecognized charges (spec 0004, AC-11). */

const SURCHARGE_TERMS_LOCATOR = "Surcharge terms";

const capitalize = (text: string): string =>
  text.charAt(0).toUpperCase() + text.slice(1);

const billedEvidence = (
  invoice: InvoiceRecord,
  charges: readonly InvoiceChargeRecord[],
): readonly EvidenceItem[] =>
  charges.map((charge) =>
    evidenceItem(
      "Surcharge billed",
      formatCents(charge.amountCents),
      invoice,
      chargeLocator(charge.lineNo),
    ),
  );

const typeFinding = (
  invoice: InvoiceRecord,
  contract: ContractRecord,
  type: SurchargeType,
  charges: readonly InvoiceChargeRecord[],
  ctx: AuditContext,
): Finding | null => {
  const amounts = charges.map((charge) => charge.amountCents);
  const billed = sumCents(amounts);
  const terms = contract.surcharges.find((s) => s.surchargeType === type);
  const base = { check: "surcharge", detail: `surcharge-${type}` } as const;

  if (terms === undefined) {
    if (billed === 0) return null;
    return moneyFinding(invoice, ctx, {
      ...base,
      amountCents: billed,
      title: `${capitalize(type)} surcharge not permitted`,
      calculation: `${amountsTerm(amounts)} ${type} surcharge, none permitted = ${formatCents(billed)}`,
      evidence: [
        ...billedEvidence(invoice, charges),
        evidenceItem(
          "Permitted surcharges",
          `no ${type} surcharge`,
          contract,
          contract.surchargeClause ?? SURCHARGE_TERMS_LOCATOR,
        ),
      ],
    });
  }
  if (terms.capBps === null) return null;

  const cap = percentOfCents(invoice.subtotalCents, terms.capBps);
  const excess = billed - cap;
  if (excess <= 0) return null;
  return moneyFinding(invoice, ctx, {
    ...base,
    amountCents: excess,
    title: `${capitalize(type)} surcharge above cap`,
    calculation: `${amountsTerm(amounts)} ${MINUS} ${formatBps(terms.capBps)} ${TIMES} ${formatCents(invoice.subtotalCents)} = ${formatCents(excess)}`,
    evidence: [
      ...billedEvidence(invoice, charges),
      evidenceItem(
        "Subtotal",
        formatCents(invoice.subtotalCents),
        invoice,
        INVOICE_LABEL.subtotal,
      ),
      evidenceItem("Cap", formatBps(terms.capBps), contract, terms.clause),
    ],
  });
};

const typedFindings = (
  invoice: InvoiceRecord,
  ctx: AuditContext,
): readonly Finding[] => {
  const contract = ctx.contractFor(invoice.supplierKey, invoice.invoiceDate);
  if (contract === null) return [];
  const byType = Map.groupBy(
    invoice.charges.filter((charge) => charge.kind === "surcharge"),
    (charge) => charge.surchargeType ?? "other",
  );
  return [...byType].flatMap(([type, charges]) => {
    const finding = typeFinding(invoice, contract, type, charges, ctx);
    return finding === null ? [] : [finding];
  });
};

const otherChargeFindings = (invoice: InvoiceRecord): readonly Finding[] =>
  invoice.charges
    .filter((charge) => charge.kind === "other")
    .map((charge) =>
      reviewFinding(invoice, {
        check: "surcharge",
        detail: `charge-line-${charge.lineNo}`,
        title: `Unrecognized charge: ${charge.label}`,
        evidence: [
          evidenceItem(
            "Charge billed",
            formatCents(charge.amountCents),
            invoice,
            chargeLocator(charge.lineNo),
          ),
        ],
      }),
    );

export const checkSurcharges = (
  originals: readonly InvoiceRecord[],
  ctx: AuditContext,
): readonly Finding[] =>
  originals.flatMap((invoice) => [
    ...typedFindings(invoice, ctx),
    ...otherChargeFindings(invoice),
  ]);
