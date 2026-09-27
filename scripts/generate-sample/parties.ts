import type { ContractExtraction } from "../../lib/schemas/extraction";
import { formatBps, parseRate } from "../../lib/schemas/money";

/**
 * The printed extras the fixture does not hold (spec 0003): letterheads, the buyer, clause
 * wording, the footer and the stamp. Every name, address and contact is invented: phones sit in
 * the 555 01xx range and emails on example.com, so no real business or person is named.
 */

export type Party = {
  readonly name: string;
  readonly addressLines: readonly string[];
  readonly phone: string;
  readonly email: string;
};

export const BUYER: Party = {
  name: "Halvorsen Components Inc.",
  addressLines: ["400 Assembly Way", "Millbrook, MN 55012"],
  phone: "555-0113",
  email: "ap.halvorsen@example.com",
};

const SUPPLIERS: readonly Party[] = [
  {
    name: "Northline Industrial Supply",
    addressLines: ["2140 Foundry Road", "Cedar Falls, OH 45390"],
    phone: "555-0142",
    email: "billing.northline@example.com",
  },
  {
    name: "Brightwater Packaging Co.",
    addressLines: ["88 Harbor Street", "Portside, WA 98072"],
    phone: "555-0168",
    email: "billing.brightwater@example.com",
  },
];

/** The letterhead for a fixture supplier name; throws for a supplier with no letterhead (a bug). */
export const supplierParty = (supplierName: string): Party => {
  const party = SUPPLIERS.find((supplier) => supplier.name === supplierName);
  if (party === undefined) {
    throw new Error(`parties: no letterhead for supplier "${supplierName}"`);
  }
  return party;
};

export const FOOTER_TEXT =
  "Fictional sample document · Overpayment Auditor demo";
export const PAYMENT_TERMS_TEXT = "Terms: Net 30";

/** The brief's reminder copy of NL-88310, rendered as an image only scan. */
export const SCAN_FILENAME = "NL88310.pdf";
export const SCAN_STAMP_TEXT = "REMINDER - payment overdue";

export type ContractSection = {
  readonly heading: string;
  readonly body: readonly string[];
};

/** Generic sections every contract opens with; they never mention freight or surcharges. */
const OPENING_SECTIONS = (
  contract: ContractExtraction,
): readonly ContractSection[] => [
  {
    heading: "Section 1 Scope",
    body: [
      `${contract.supplierName} (Supplier) agrees to sell and ${BUYER.name} (Buyer) agrees to buy the goods listed in Schedule A on the terms of this agreement.`,
    ],
  },
  {
    heading: "Section 2 Prices",
    body: [
      "The unit prices in Schedule A are fixed for the full term. Supplier shall invoice each shipment at those prices against a Buyer purchase order.",
    ],
  },
  {
    heading: "Section 3 Payment",
    body: [
      "Buyer shall pay each correct invoice within 30 days of the invoice date.",
    ],
  },
];

const FREIGHT_WORDING = {
  included:
    "Prices include delivery to Buyer's facility. Freight shall not be invoiced separately.",
  billable: "Freight is billable at cost and shown as a separate invoice line.",
} as const;

const capText = (capRate: string): string => {
  const bps = parseRate(capRate, "capRate");
  if (!bps.ok) throw new Error(`parties: ${bps.error}`);
  return formatBps(bps.value);
};

const surchargeWording = (
  surcharges: ContractExtraction["surcharges"],
): readonly string[] =>
  surcharges.length === 0
    ? ["No surcharges are permitted."]
    : [
        ...surcharges.map((surcharge) =>
          surcharge.capRate === null
            ? `Supplier may apply a ${surcharge.surchargeType} surcharge.`
            : `Supplier may apply a ${surcharge.surchargeType} surcharge not exceeding ${capText(surcharge.capRate)} of the goods subtotal.`,
        ),
        "No other surcharges are permitted.",
      ];

/**
 * The numbered sections a contract prints, headings from the fixture clauses and wording chosen
 * by the fixture values (spec 0003, Clause wording). `not_stated` freight prints no freight text.
 */
export const contractSections = (
  contract: ContractExtraction,
): readonly ContractSection[] => {
  const freight =
    contract.freightTerms === "not_stated" || contract.freightClause === null
      ? []
      : [
          {
            heading: `${contract.freightClause} Delivery`,
            body: [FREIGHT_WORDING[contract.freightTerms]],
          },
        ];
  const surcharges =
    contract.surchargeClause === null
      ? []
      : [
          {
            heading: `${contract.surchargeClause} Surcharges`,
            body: surchargeWording(contract.surcharges),
          },
        ];
  return [...OPENING_SECTIONS(contract), ...freight, ...surcharges];
};
