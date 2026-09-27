import "server-only";
import type { Db } from "./client";
import {
  auditRuns,
  contractPrices,
  contracts,
  contractSurcharges,
  decisions,
  documents,
  findings,
  invoiceCharges,
  invoiceLines,
  invoices,
  payments,
  poLines,
  purchaseOrders,
  receipts,
  suppliers,
} from "./schema";

/** Children before parents, so the order holds even without cascades. */
const TABLES_IN_DELETE_ORDER = [
  decisions,
  findings,
  auditRuns,
  invoiceCharges,
  invoiceLines,
  invoices,
  poLines,
  purchaseOrders,
  contractPrices,
  contractSurcharges,
  contracts,
  receipts,
  payments,
  documents,
  suppliers,
] as const;

/** Empties every table, decisions included, in one transaction (AC-14). The demo's clean start. */
export const resetAll = (db: Db): void =>
  db.transaction((tx) => {
    TABLES_IN_DELETE_ORDER.forEach((table) => tx.delete(table).run());
  });
