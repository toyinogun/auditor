import type {
  ContractExtraction,
  InvoiceExtraction,
  PaymentCsvRow,
  PurchaseOrderExtraction,
  ReceiptCsvRow,
} from "../extraction";

/**
 * The brief's fictional world (docs/brief.md, "Sample data") as extraction and CSV shapes.
 * Every figure the brief prints is copied exactly; dates, descriptions, clauses and payment
 * references are filled in where the brief is silent. Never change a figure to make a test pass.
 */

export type SampleDocument<T> = {
  readonly filename: string;
  readonly extraction: T;
};
export type SampleCsv<T> = {
  readonly filename: string;
  readonly rows: readonly T[];
};

const NORTHLINE = "Northline Industrial Supply";
const BRIGHTWATER = "Brightwater Packaging Co.";

const ITEM = {
  bearing: { sku: "NL-BRG-6204", description: "Deep groove ball bearing 6204" },
  shaft: { sku: "NL-SHF-2012", description: "Drive shaft 20 x 1200 mm" },
  gasket: { sku: "NL-GSK-0850", description: "Flange gasket 85 mm" },
  bolts: { sku: "NL-FST-M8", description: "M8 hex bolts, box of 100" },
  belt: { sku: "NL-BLT-A42", description: "V-belt A42" },
  box: {
    sku: "BW-BOX-4030",
    description: "Corrugated shipping box 40 x 30 cm",
  },
  tape: { sku: "BW-TAPE-48", description: "Packing tape 48 mm" },
  wrap: { sku: "BW-WRAP-500", description: "Stretch wrap 500 mm roll" },
} as const;

const contracts: readonly SampleDocument<ContractExtraction>[] = [
  {
    filename: "C-2026-014.pdf",
    extraction: {
      contractNumber: "C-2026-014",
      supplierName: NORTHLINE,
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      currency: "USD",
      prices: [
        { ...ITEM.bearing, unitPrice: "4.85", clause: "Schedule A, item 1" },
        { ...ITEM.shaft, unitPrice: "18.40", clause: "Schedule A, item 2" },
        { ...ITEM.gasket, unitPrice: "0.92", clause: "Schedule A, item 3" },
        { ...ITEM.bolts, unitPrice: "12.60", clause: "Schedule A, item 4" },
        { ...ITEM.belt, unitPrice: "9.75", clause: "Schedule A, item 5" },
      ],
      freightTerms: "included",
      freightClause: "Section 4.2",
      surchargeClause: "Section 5.1",
      surcharges: [
        { surchargeType: "fuel", capRate: "2.5", clause: "Section 5.1" },
      ],
    },
  },
  {
    filename: "C-2026-022.pdf",
    extraction: {
      contractNumber: "C-2026-022",
      supplierName: BRIGHTWATER,
      startDate: "2026-02-01",
      endDate: "2027-01-31",
      currency: "USD",
      prices: [
        { ...ITEM.box, unitPrice: "1.12", clause: "Schedule A, item 1" },
        { ...ITEM.tape, unitPrice: "2.35", clause: "Schedule A, item 2" },
        { ...ITEM.wrap, unitPrice: "21.90", clause: "Schedule A, item 3" },
      ],
      freightTerms: "not_stated",
      freightClause: null,
      surchargeClause: "Section 6.1",
      surcharges: [],
    },
  },
];

const purchaseOrders: readonly SampleDocument<PurchaseOrderExtraction>[] = [
  {
    filename: "PO-4501.pdf",
    extraction: {
      poNumber: "PO-4501",
      supplierName: NORTHLINE,
      orderDate: "2026-01-12",
      currency: "USD",
      lines: [
        { ...ITEM.bearing, quantity: 2000, unitPrice: "4.85" },
        { ...ITEM.shaft, quantity: 300, unitPrice: "18.40" },
      ],
    },
  },
  {
    filename: "PO-4502.pdf",
    extraction: {
      poNumber: "PO-4502",
      supplierName: NORTHLINE,
      orderDate: "2026-02-09",
      currency: "USD",
      lines: [
        { ...ITEM.gasket, quantity: 5000, unitPrice: "0.92" },
        { ...ITEM.bolts, quantity: 150, unitPrice: "12.60" },
        { ...ITEM.belt, quantity: 400, unitPrice: "9.75" },
      ],
    },
  },
  {
    filename: "PO-4503.pdf",
    extraction: {
      poNumber: "PO-4503",
      supplierName: BRIGHTWATER,
      orderDate: "2026-02-16",
      currency: "USD",
      lines: [
        { ...ITEM.box, quantity: 8000, unitPrice: "1.12" },
        { ...ITEM.tape, quantity: 600, unitPrice: "2.35" },
      ],
    },
  },
  {
    filename: "PO-4504.pdf",
    extraction: {
      poNumber: "PO-4504",
      supplierName: NORTHLINE,
      orderDate: "2026-03-16",
      currency: "USD",
      lines: [{ ...ITEM.bearing, quantity: 1500, unitPrice: "4.85" }],
    },
  },
];

const fuel = (rate: string, amount: string) =>
  ({
    kind: "surcharge",
    surchargeType: "fuel",
    label: `Fuel surcharge ${rate}%`,
    rate,
    amount,
  }) as const;

/** NL-88310 and its reminder copy NL88310 print the same lines and charges. */
const nl88310Body: Omit<InvoiceExtraction, "invoiceNumber" | "invoiceDate"> = {
  supplierName: NORTHLINE,
  poNumber: "PO-4504",
  currency: "USD",
  lines: [
    { ...ITEM.bearing, quantity: 1500, unitPrice: "5.10", amount: "7650.00" },
  ],
  charges: [
    fuel("4.0", "306.00"),
    {
      kind: "freight",
      surchargeType: null,
      label: "Freight",
      rate: null,
      amount: "185.00",
    },
  ],
  subtotal: "7650.00",
  total: "8141.00",
};

const invoices: readonly SampleDocument<InvoiceExtraction>[] = [
  {
    filename: "NL-88121.pdf",
    extraction: {
      invoiceNumber: "NL-88121",
      supplierName: NORTHLINE,
      invoiceDate: "2026-01-30",
      poNumber: "PO-4501",
      currency: "USD",
      lines: [
        {
          ...ITEM.bearing,
          quantity: 2000,
          unitPrice: "4.85",
          amount: "9700.00",
        },
        { ...ITEM.shaft, quantity: 300, unitPrice: "18.40", amount: "5520.00" },
      ],
      charges: [fuel("2.5", "380.50")],
      subtotal: "15220.00",
      total: "15600.50",
    },
  },
  {
    filename: "NL-88203.pdf",
    extraction: {
      invoiceNumber: "NL-88203",
      supplierName: NORTHLINE,
      invoiceDate: "2026-02-27",
      poNumber: "PO-4502",
      currency: "USD",
      lines: [
        {
          ...ITEM.gasket,
          quantity: 5000,
          unitPrice: "0.97",
          amount: "4850.00",
        },
        { ...ITEM.bolts, quantity: 150, unitPrice: "12.60", amount: "1890.00" },
        { ...ITEM.belt, quantity: 400, unitPrice: "9.75", amount: "3900.00" },
      ],
      charges: [fuel("2.5", "266.00")],
      subtotal: "10640.00",
      total: "10906.00",
    },
  },
  {
    filename: "NL-88310.pdf",
    extraction: {
      ...nl88310Body,
      invoiceNumber: "NL-88310",
      invoiceDate: "2026-04-03",
    },
  },
  {
    filename: "NL88310.pdf",
    extraction: {
      ...nl88310Body,
      invoiceNumber: "NL88310",
      invoiceDate: "2026-05-04",
    },
  },
  {
    filename: "BW-5521.pdf",
    extraction: {
      invoiceNumber: "BW-5521",
      supplierName: BRIGHTWATER,
      invoiceDate: "2026-03-06",
      poNumber: "PO-4503",
      currency: "USD",
      lines: [
        { ...ITEM.box, quantity: 8000, unitPrice: "1.12", amount: "8960.00" },
        { ...ITEM.tape, quantity: 600, unitPrice: "2.35", amount: "1410.00" },
      ],
      charges: [
        {
          kind: "surcharge",
          surchargeType: "energy",
          label: "Energy surcharge 3%",
          rate: "3",
          amount: "311.10",
        },
      ],
      subtotal: "10370.00",
      total: "10681.10",
    },
  },
  {
    filename: "BW-5530.pdf",
    extraction: {
      invoiceNumber: "BW-5530",
      supplierName: BRIGHTWATER,
      invoiceDate: "2026-04-14",
      poNumber: null,
      currency: "USD",
      lines: [
        { ...ITEM.tape, quantity: 200, unitPrice: "2.35", amount: "470.00" },
      ],
      charges: [],
      subtotal: "470.00",
      total: "470.00",
    },
  },
];

const receipt = (
  po_number: string,
  sku: string,
  quantity_received: string,
  received_date: string,
) => ({
  po_number,
  sku,
  quantity_received,
  received_date,
});

const receipts: SampleCsv<ReceiptCsvRow> = {
  filename: "receipts.csv",
  rows: [
    receipt("PO-4501", ITEM.bearing.sku, "2000", "2026-01-26"),
    receipt("PO-4501", ITEM.shaft.sku, "300", "2026-01-26"),
    receipt("PO-4502", ITEM.gasket.sku, "5000", "2026-02-23"),
    receipt("PO-4502", ITEM.bolts.sku, "150", "2026-02-23"),
    receipt("PO-4502", ITEM.belt.sku, "360", "2026-02-23"),
    receipt("PO-4503", ITEM.box.sku, "8000", "2026-03-02"),
    receipt("PO-4503", ITEM.tape.sku, "600", "2026-03-02"),
    receipt("PO-4504", ITEM.bearing.sku, "1500", "2026-03-30"),
  ],
};

/** The ledger writes Northline with its legal suffix, as real ledgers do. */
const NORTHLINE_LEDGER = `${NORTHLINE} Inc.`;

const payments: SampleCsv<PaymentCsvRow> = {
  filename: "ap_payments.csv",
  rows: [
    {
      invoice_number: "NL-88121",
      supplier: NORTHLINE_LEDGER,
      amount: "15600.50",
      paid_date: "2026-03-01",
      reference: "ACH-10231",
    },
    {
      invoice_number: "NL-88203",
      supplier: NORTHLINE_LEDGER,
      amount: "10906.00",
      paid_date: "2026-03-29",
      reference: "ACH-10288",
    },
    {
      invoice_number: "BW-5521",
      supplier: BRIGHTWATER,
      amount: "10681.10",
      paid_date: "2026-04-05",
      reference: "ACH-10302",
    },
    {
      invoice_number: "NL-88310",
      supplier: NORTHLINE_LEDGER,
      amount: "8141.00",
      paid_date: "2026-05-03",
      reference: "ACH-10355",
    },
    {
      invoice_number: "NL88310",
      supplier: NORTHLINE_LEDGER,
      amount: "8141.00",
      paid_date: "2026-05-20",
      reference: "ACH-10391",
    },
  ],
};

export const BRIEF_SAMPLE = {
  contracts,
  purchaseOrders,
  invoices,
  receipts,
  payments,
} as const;

/** $53,939.60: every invoice total, the duplicate NL88310 included (brief, "Expected findings"). */
export const BRIEF_INVOICED_TOTAL_CENTS = 5_393_960;
