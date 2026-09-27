import { normalizeInvoiceNumber } from "@/lib/schemas/keys";
import type {
  AuditInput,
  ContractRecord,
  InvoiceRecord,
  PaymentRecord,
  PurchaseOrderRecord,
  ReceiptRecord,
} from "@/lib/schemas/records";

/** Read only lookups every check shares (spec 0004). Answers never depend on input order. */
export type AuditContext = {
  readonly contractFor: (
    supplierKey: string,
    date: string,
  ) => ContractRecord | null;
  readonly poByNumber: ReadonlyMap<string, PurchaseOrderRecord>;
  readonly receiptsFor: (
    poNumber: string,
    sku: string,
  ) => readonly ReceiptRecord[];
  readonly poHasReceipts: (poNumber: string) => boolean;
  readonly paymentsFor: (
    supplierKey: string,
    normalizedNumbers: readonly string[],
  ) => readonly PaymentRecord[];
  readonly invoiceByDocumentId: ReadonlyMap<number, InvoiceRecord>;
};

type Located = { readonly documentId: number; readonly rowNo: number };

const bySourceRow = (a: Located, b: Located): number =>
  a.documentId - b.documentId || a.rowNo - b.rowNo;

const receiptKey = (poNumber: string, sku: string): string =>
  `${poNumber}\u0000${sku}`;

const paymentKey = (supplierKey: string, normalizedNumber: string): string =>
  `${supplierKey}\u0000${normalizedNumber}`;

const groupSorted = <T extends Located>(
  items: readonly T[],
  keyOf: (item: T) => string,
): ReadonlyMap<string, readonly T[]> =>
  Map.groupBy([...items].sort(bySourceRow), keyOf);

/** Latest start date wins, then the lower document; stored contracts never overlap. */
const byLatestStart = (a: ContractRecord, b: ContractRecord): number =>
  b.startDate.localeCompare(a.startDate) || a.documentId - b.documentId;

/** The first purchase order of each number, by document. */
const indexPurchaseOrders = (
  purchaseOrders: readonly PurchaseOrderRecord[],
): ReadonlyMap<string, PurchaseOrderRecord> =>
  new Map(
    [...purchaseOrders]
      .sort((a, b) => b.documentId - a.documentId)
      .map((po) => [po.poNumber, po]),
  );

export const buildContext = (input: AuditInput): AuditContext => {
  const contracts = [...input.contracts].sort(byLatestStart);
  const receipts = groupSorted(input.receipts, (r) =>
    receiptKey(r.poNumber, r.sku),
  );
  const posWithReceipts = new Set(input.receipts.map((r) => r.poNumber));
  const payments = groupSorted(input.payments, (p) =>
    paymentKey(p.supplierKey, normalizeInvoiceNumber(p.invoiceNumber)),
  );

  return {
    contractFor: (supplierKey, date) =>
      contracts.find(
        (contract) =>
          contract.supplierKey === supplierKey &&
          contract.startDate <= date &&
          date <= contract.endDate,
      ) ?? null,
    poByNumber: indexPurchaseOrders(input.purchaseOrders),
    receiptsFor: (poNumber, sku) =>
      receipts.get(receiptKey(poNumber, sku)) ?? [],
    poHasReceipts: (poNumber) => posWithReceipts.has(poNumber),
    paymentsFor: (supplierKey, normalizedNumbers) =>
      [...new Set(normalizedNumbers)]
        .flatMap(
          (number) => payments.get(paymentKey(supplierKey, number)) ?? [],
        )
        .sort(bySourceRow),
    invoiceByDocumentId: new Map(
      input.invoices.map((invoice) => [invoice.documentId, invoice]),
    ),
  };
};
