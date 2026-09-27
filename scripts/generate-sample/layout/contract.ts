import type { ContractExtraction } from "../../../lib/schemas/extraction";
import { formatLongDate, formatMoney } from "../format";
import { BUYER, contractSections, supplierParty } from "../parties";
import {
  BODY_SIZE,
  centredText,
  flowPages,
  LINE_HEIGHT,
  MUTED,
  partyBlock,
  rule,
  table,
  text,
  textLines,
  wrapText,
  type Block,
  type Column,
} from "./common";
import {
  CONTENT_RIGHT,
  CONTENT_WIDTH,
  MARGIN,
  PAGE_WIDTH,
  type DrawOp,
  type LaidOutDocument,
  type Measure,
} from "./page";

const PRICE_COLUMNS: readonly Column[] = [
  { header: "Clause", x: MARGIN + 6, align: "left" },
  { header: "SKU", x: 160, align: "left" },
  { header: "Description", x: 250, align: "left" },
  { header: "Unit price", x: CONTENT_RIGHT - 6, align: "right" },
];

const SECTION_GAP = 10;
const TABLE_ROW = 18;

const headerBlock = (
  contract: ContractExtraction,
  measure: Measure,
): readonly DrawOp[] => [
  centredText(measure, PAGE_WIDTH / 2, 76, "SUPPLY AGREEMENT", {
    weight: "bold",
    size: 20,
  }),
  centredText(
    measure,
    PAGE_WIDTH / 2,
    96,
    `Contract number: ${contract.contractNumber}`,
    { size: 11 },
  ),
  rule(112, MARGIN, CONTENT_RIGHT, 1.25),
  ...partyBlock(MARGIN, 136, "Supplier", supplierParty(contract.supplierName)),
  ...partyBlock(300, 136, "Buyer", BUYER),
  ...textLines(MARGIN, 200, [
    `Term: ${formatLongDate(contract.startDate)} to ${formatLongDate(contract.endDate)}`,
    `Currency: ${contract.currency}`,
  ]),
];

const sectionBlock = (
  heading: string,
  paragraphs: readonly string[],
  measure: Measure,
): Block => {
  const lines = paragraphs.flatMap((paragraph) =>
    wrapText(measure, paragraph, "regular", BODY_SIZE, CONTENT_WIDTH),
  );
  return {
    height: LINE_HEIGHT * (lines.length + 1) + SECTION_GAP,
    draw: (top) => [
      text(MARGIN, top + LINE_HEIGHT, heading, { weight: "bold" }),
      ...textLines(MARGIN, top + LINE_HEIGHT * 2, lines),
    ],
  };
};

const scheduleBlock = (
  contract: ContractExtraction,
  measure: Measure,
): Block => ({
  height:
    LINE_HEIGHT + 8 + TABLE_ROW * (contract.prices.length + 1) + SECTION_GAP,
  draw: (top) => [
    text(MARGIN, top + LINE_HEIGHT, "Schedule A Agreed unit prices", {
      weight: "bold",
    }),
    ...table(
      measure,
      PRICE_COLUMNS,
      contract.prices.map((price) => [
        price.clause,
        price.sku,
        price.description,
        formatMoney(price.unitPrice),
      ]),
      top + LINE_HEIGHT + 8,
    ).ops,
  ],
});

const signatureBlock = (contract: ContractExtraction): Block => ({
  height: 70,
  draw: (top) => [
    rule(top + 40, MARGIN, MARGIN + 200),
    rule(top + 40, 300, 500),
    text(MARGIN, top + 54, `For ${contract.supplierName}`, { color: MUTED }),
    text(300, top + 54, `For ${BUYER.name}`, { color: MUTED }),
  ],
});

/**
 * A contract (spec 0003): parties, term, the numbered sections with clause wording chosen by the
 * fixture values, and Schedule A printing each price beside its clause. Flows onto a second page
 * when needed.
 */
export const layoutContract = (
  contract: ContractExtraction,
  measure: Measure,
): LaidOutDocument => {
  const blocks: readonly Block[] = [
    ...contractSections(contract).map((section) =>
      sectionBlock(section.heading, section.body, measure),
    ),
    scheduleBlock(contract, measure),
    signatureBlock(contract),
  ];
  const [first, ...rest] = flowPages(
    blocks,
    228,
    () => ({
      ops: [
        text(MARGIN, 60, `Contract ${contract.contractNumber} (continued)`, {
          color: MUTED,
        }),
        rule(70),
      ],
      top: 80,
    }),
    measure,
  );
  return {
    info: {
      title: contract.contractNumber,
      author: contract.supplierName,
      date: contract.startDate,
    },
    pages: [[...headerBlock(contract, measure), ...first], ...rest],
  };
};
