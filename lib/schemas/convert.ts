import type { z } from "zod";
import { isCalendarDate } from "./dates";
import { CURRENCY } from "./enums";
import {
  ContractExtraction,
  InvoiceExtraction,
  PaymentCsvRow,
  PurchaseOrderExtraction,
  ReceiptCsvRow,
} from "./extraction";
import { normalizeSupplierKey } from "./keys";
import {
  formatBps,
  formatCents,
  parseMoney,
  parseRate,
  percentOfCents,
} from "./money";
import type {
  ContractPriceRecord,
  ContractRecord,
  ContractSurchargeRecord,
  DocumentRef,
  InvoiceChargeRecord,
  InvoiceLineRecord,
  InvoiceRecord,
  PaymentRecord,
  PurchaseOrderLineRecord,
  PurchaseOrderRecord,
  ReceiptRecord,
} from "./records";
import { err, ok, type Result } from "./result";

/**
 * Pure converters from extraction and CSV shapes to records (spec 0002). The offline sample
 * and the LLM path both come through here, so every money, quantity, currency and arithmetic
 * rule lives in one place. Every error names the field, line or row it is about.
 */

type InvoiceLineExtraction = InvoiceExtraction["lines"][number];
type InvoiceChargeExtraction = InvoiceExtraction["charges"][number];

const describeIssues = (error: z.ZodError): string =>
  error.issues
    .map((issue) => `${issue.path.join(".") || "document"}: ${issue.message}`)
    .join("; ");

const parseShape = <T>(schema: z.ZodType<T>, input: unknown): Result<T> => {
  const parsed = schema.safeParse(input);
  return parsed.success ? ok(parsed.data) : err(describeIssues(parsed.error));
};

/** Keeps every value when all succeed, else joins every error. */
const all = <T>(results: readonly Result<T>[]): Result<readonly T[]> => {
  const errors = results.flatMap((result) => (result.ok ? [] : [result.error]));
  return errors.length > 0
    ? err(errors.join("; "))
    : ok(results.flatMap((result) => (result.ok ? [result.value] : [])));
};

const checkCurrency = (currency: string): Result<typeof CURRENCY> =>
  currency.trim().toUpperCase() === CURRENCY
    ? ok(CURRENCY)
    : err(`currency: "${currency}" is not supported, only ${CURRENCY}`);

const checkDate = (text: string, field: string): Result<string> =>
  isCalendarDate(text)
    ? ok(text)
    : err(`${field}: "${text}" is not a real YYYY-MM-DD date`);

const checkQuantity = (quantity: number, where: string): Result<number> =>
  Number.isInteger(quantity) && quantity > 0
    ? ok(quantity)
    : err(`${where}: quantity ${quantity} is not a positive whole number`);

const checkSupplier = (
  name: string,
): Result<{ supplierKey: string; supplierName: string }> => {
  const supplierKey = normalizeSupplierKey(name);
  return supplierKey.length > 0
    ? ok({ supplierKey, supplierName: name.trim() })
    : err(`supplierName: "${name}" has no letters or digits`);
};

const firstDuplicate = (values: readonly string[]): string | undefined =>
  values.find((value, index) => values.indexOf(value) !== index);

const sum = (values: readonly number[]): number =>
  values.reduce((total, value) => total + value, 0);

const toInvoiceLine = (
  line: InvoiceLineExtraction,
  index: number,
): Result<InvoiceLineRecord> => {
  const lineNo = index + 1;
  const where = `line ${lineNo}`;
  const quantity = checkQuantity(line.quantity, where);
  if (!quantity.ok) return quantity;
  const unitPrice = parseMoney(line.unitPrice, `${where} unit price`);
  if (!unitPrice.ok) return unitPrice;
  const amount = parseMoney(line.amount, `${where} amount`);
  if (!amount.ok) return amount;
  const expected = quantity.value * unitPrice.value;
  if (expected !== amount.value) {
    return err(
      `${where}: ${quantity.value} × ${formatCents(unitPrice.value)} = ${formatCents(expected)}, ` +
        `but the printed amount is ${formatCents(amount.value)}`,
    );
  }
  return ok({
    lineNo,
    sku: line.sku,
    description: line.description,
    quantity: quantity.value,
    unitPriceCents: unitPrice.value,
    amountCents: amount.value,
  });
};

const toInvoiceCharge =
  (subtotalCents: number) =>
  (
    charge: InvoiceChargeExtraction,
    index: number,
  ): Result<InvoiceChargeRecord> => {
    const lineNo = index + 1;
    const where = `charge ${lineNo}`;
    if ((charge.kind === "surcharge") !== (charge.surchargeType !== null)) {
      return err(
        `${where}: a surcharge needs a surcharge type, and only a surcharge may have one`,
      );
    }
    const amount = parseMoney(charge.amount, `${where} amount`);
    if (!amount.ok) return amount;
    const rate =
      charge.rate === null ? ok(null) : parseRate(charge.rate, `${where} rate`);
    if (!rate.ok) return rate;
    if (rate.value !== null) {
      const expected = percentOfCents(subtotalCents, rate.value);
      if (expected !== amount.value) {
        return err(
          `${where}: ${formatBps(rate.value)} of ${formatCents(subtotalCents)} is ` +
            `${formatCents(expected)}, but the printed amount is ${formatCents(amount.value)}`,
        );
      }
    }
    return ok({
      lineNo,
      kind: charge.kind,
      surchargeType: charge.surchargeType,
      label: charge.label,
      rateBps: rate.value,
      amountCents: amount.value,
    });
  };

/** Invoice extraction to record, enforcing line, subtotal, rated charge and total arithmetic (AC-5). */
export const toInvoiceRecord = (
  input: unknown,
  ref: DocumentRef,
): Result<InvoiceRecord> => {
  const shape = parseShape(InvoiceExtraction, input);
  if (!shape.ok) return shape;
  const extraction = shape.value;
  const supplier = checkSupplier(extraction.supplierName);
  if (!supplier.ok) return supplier;
  const currency = checkCurrency(extraction.currency);
  if (!currency.ok) return currency;
  const invoiceDate = checkDate(extraction.invoiceDate, "invoiceDate");
  if (!invoiceDate.ok) return invoiceDate;
  const lines = all(extraction.lines.map(toInvoiceLine));
  if (!lines.ok) return lines;

  const subtotal = parseMoney(extraction.subtotal, "subtotal");
  if (!subtotal.ok) return subtotal;
  const linesTotal = sum(lines.value.map((line) => line.amountCents));
  if (linesTotal !== subtotal.value) {
    return err(
      `subtotal: the lines add up to ${formatCents(linesTotal)}, ` +
        `but the printed subtotal is ${formatCents(subtotal.value)}`,
    );
  }

  const charges = all(extraction.charges.map(toInvoiceCharge(subtotal.value)));
  if (!charges.ok) return charges;
  const total = parseMoney(extraction.total, "total");
  if (!total.ok) return total;
  const expectedTotal =
    subtotal.value + sum(charges.value.map((charge) => charge.amountCents));
  if (expectedTotal !== total.value) {
    return err(
      `total: subtotal plus charges is ${formatCents(expectedTotal)}, ` +
        `but the printed total is ${formatCents(total.value)}`,
    );
  }

  return ok({
    ...ref,
    ...supplier.value,
    invoiceNumber: extraction.invoiceNumber,
    invoiceDate: invoiceDate.value,
    poNumber: extraction.poNumber,
    currency: currency.value,
    subtotalCents: subtotal.value,
    totalCents: total.value,
    lines: lines.value,
    charges: charges.value,
  });
};

const toContractPrice = (
  price: ContractExtraction["prices"][number],
  index: number,
): Result<ContractPriceRecord> => {
  const unitPrice = parseMoney(
    price.unitPrice,
    `price ${index + 1} (${price.sku}) unit price`,
  );
  if (!unitPrice.ok) return unitPrice;
  return ok({
    sku: price.sku,
    description: price.description,
    unitPriceCents: unitPrice.value,
    clause: price.clause,
  });
};

const toContractSurcharge = (
  surcharge: ContractExtraction["surcharges"][number],
  index: number,
): Result<ContractSurchargeRecord> => {
  const cap =
    surcharge.capRate === null
      ? ok(null)
      : parseRate(surcharge.capRate, `surcharge ${index + 1} cap`);
  if (!cap.ok) return cap;
  return ok({
    surchargeType: surcharge.surchargeType,
    capBps: cap.value,
    clause: surcharge.clause,
  });
};

/** Contract extraction to record: real dates in order, USD, one price per SKU, one surcharge per type. */
export const toContractRecord = (
  input: unknown,
  ref: DocumentRef,
): Result<ContractRecord> => {
  const shape = parseShape(ContractExtraction, input);
  if (!shape.ok) return shape;
  const extraction = shape.value;
  const supplier = checkSupplier(extraction.supplierName);
  if (!supplier.ok) return supplier;
  const currency = checkCurrency(extraction.currency);
  if (!currency.ok) return currency;
  const dates = all([
    checkDate(extraction.startDate, "startDate"),
    checkDate(extraction.endDate, "endDate"),
  ]);
  if (!dates.ok) return dates;
  if (extraction.endDate < extraction.startDate) {
    return err(
      `endDate: ${extraction.endDate} is before startDate ${extraction.startDate}`,
    );
  }
  const repeatedSku = firstDuplicate(
    extraction.prices.map((price) => price.sku),
  );
  if (repeatedSku !== undefined)
    return err(`prices: ${repeatedSku} is priced more than once`);
  const repeatedType = firstDuplicate(
    extraction.surcharges.map((s) => s.surchargeType),
  );
  if (repeatedType !== undefined)
    return err(`surcharges: ${repeatedType} is listed more than once`);

  const prices = all(extraction.prices.map(toContractPrice));
  if (!prices.ok) return prices;
  const surcharges = all(extraction.surcharges.map(toContractSurcharge));
  if (!surcharges.ok) return surcharges;

  return ok({
    ...ref,
    ...supplier.value,
    contractNumber: extraction.contractNumber,
    startDate: extraction.startDate,
    endDate: extraction.endDate,
    currency: currency.value,
    freightTerms: extraction.freightTerms,
    freightClause: extraction.freightClause,
    surchargeClause: extraction.surchargeClause,
    prices: prices.value,
    surcharges: surcharges.value,
  });
};

const toPurchaseOrderLine = (
  line: PurchaseOrderExtraction["lines"][number],
  index: number,
): Result<PurchaseOrderLineRecord> => {
  const lineNo = index + 1;
  const where = `line ${lineNo}`;
  const quantity = checkQuantity(line.quantity, where);
  if (!quantity.ok) return quantity;
  const unitPrice =
    line.unitPrice === null
      ? ok(null)
      : parseMoney(line.unitPrice, `${where} unit price`);
  if (!unitPrice.ok) return unitPrice;
  return ok({
    lineNo,
    sku: line.sku,
    description: line.description,
    quantity: quantity.value,
    unitPriceCents: unitPrice.value,
  });
};

/** Purchase order extraction to record: USD, a real order date, whole positive quantities. */
export const toPurchaseOrderRecord = (
  input: unknown,
  ref: DocumentRef,
): Result<PurchaseOrderRecord> => {
  const shape = parseShape(PurchaseOrderExtraction, input);
  if (!shape.ok) return shape;
  const extraction = shape.value;
  const supplier = checkSupplier(extraction.supplierName);
  if (!supplier.ok) return supplier;
  const currency = checkCurrency(extraction.currency);
  if (!currency.ok) return currency;
  const orderDate = checkDate(extraction.orderDate, "orderDate");
  if (!orderDate.ok) return orderDate;
  const lines = all(extraction.lines.map(toPurchaseOrderLine));
  if (!lines.ok) return lines;
  return ok({
    ...ref,
    ...supplier.value,
    poNumber: extraction.poNumber,
    orderDate: orderDate.value,
    currency: currency.value,
    lines: lines.value,
  });
};

/** Prefixes a CSV error with its row so the reason says where to look. */
const inRow = <T>(rowNo: number, result: Result<T>): Result<T> =>
  result.ok ? result : err(`row ${rowNo}: ${result.error}`);

const required = (text: string, field: string): Result<string> => {
  const trimmed = text.trim();
  return trimmed.length > 0 ? ok(trimmed) : err(`${field} is empty`);
};

const WHOLE_NUMBER = /^\d+$/;

const convertReceiptRow = (
  input: unknown,
  ref: DocumentRef,
  rowNo: number,
): Result<ReceiptRecord> => {
  const shape = parseShape(ReceiptCsvRow, input);
  if (!shape.ok) return shape;
  const row = shape.value;
  const poNumber = required(row.po_number, "po_number");
  if (!poNumber.ok) return poNumber;
  const sku = required(row.sku, "sku");
  if (!sku.ok) return sku;
  const quantityText = row.quantity_received.trim();
  if (!WHOLE_NUMBER.test(quantityText) || Number(quantityText) === 0) {
    return err(
      `quantity_received: "${row.quantity_received}" is not a positive whole number`,
    );
  }
  const receivedDate = checkDate(row.received_date.trim(), "received_date");
  if (!receivedDate.ok) return receivedDate;
  return ok({
    ...ref,
    rowNo,
    poNumber: poNumber.value,
    sku: sku.value,
    quantityReceived: Number(quantityText),
    receivedDate: receivedDate.value,
  });
};

/** One `receipts.csv` data row to a record. `rowNo` counts data rows from 1, header excluded. */
export const toReceiptRecord = (
  input: unknown,
  ref: DocumentRef,
  rowNo: number,
): Result<ReceiptRecord> => inRow(rowNo, convertReceiptRow(input, ref, rowNo));

const convertPaymentRow = (
  input: unknown,
  ref: DocumentRef,
  rowNo: number,
): Result<PaymentRecord> => {
  const shape = parseShape(PaymentCsvRow, input);
  if (!shape.ok) return shape;
  const row = shape.value;
  const invoiceNumber = required(row.invoice_number, "invoice_number");
  if (!invoiceNumber.ok) return invoiceNumber;
  const supplier = checkSupplier(row.supplier);
  if (!supplier.ok) return supplier;
  const amount = parseMoney(row.amount.trim(), "amount");
  if (!amount.ok) return amount;
  const paidDate = checkDate(row.paid_date.trim(), "paid_date");
  if (!paidDate.ok) return paidDate;
  const reference = row.reference.trim();
  return ok({
    ...ref,
    ...supplier.value,
    rowNo,
    invoiceNumber: invoiceNumber.value,
    amountCents: amount.value,
    paidDate: paidDate.value,
    reference: reference.length > 0 ? reference : null,
  });
};

/** One `ap_payments.csv` data row to a record. `rowNo` counts data rows from 1, header excluded. */
export const toPaymentRecord = (
  input: unknown,
  ref: DocumentRef,
  rowNo: number,
): Result<PaymentRecord> => inRow(rowNo, convertPaymentRow(input, ref, rowNo));
