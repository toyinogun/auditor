import "server-only";
import type { Db } from "@/lib/db/client";
import { insertDocument, setDocumentStatus } from "@/lib/db/documents";
import {
  saveContract,
  saveInvoice,
  savePayments,
  savePurchaseOrder,
  saveReceipts,
} from "@/lib/db/records";
import type {
  AuditInput,
  ContractRecord,
  DocumentRef,
  InvoiceRecord,
  PaymentRecord,
  PurchaseOrderRecord,
  ReceiptRecord,
} from "@/lib/schemas/records";
import { err, ok, orThrow, type Result } from "@/lib/schemas/result";
import type { SampleManifest } from "@/lib/schemas/sample-manifest";

/**
 * Storage steps shared by the offline run (`sample.ts`) and the live run (`live.ts`), so both
 * number documents and save records the same way. Call them inside the caller's transaction.
 */

export type ManifestFiles = Pick<SampleManifest, "files">;

export type RefFor = (filename: string) => DocumentRef;

/** Stores one document per manifest file, in manifest order with its real hash; returns a ref lookup. */
export const storeManifestDocuments = (
  db: Db,
  manifest: ManifestFiles,
  now: number,
): RefFor => {
  const refs = new Map(
    manifest.files.map((file) => {
      const { document } = insertDocument(
        db,
        {
          sha256: file.sha256,
          filename: file.filename,
          mimeType: file.mimeType,
          sizeBytes: file.sizeBytes,
          source: "sample",
          kind: file.kind,
        },
        now,
      );
      return [
        file.filename,
        { documentId: document.id, filename: file.filename },
      ];
    }),
  );
  return (filename) => {
    const ref = refs.get(filename);
    if (!ref) throw new Error(`sample file ${filename} is not in the manifest`);
    return ref;
  };
};

export type CsvRefs = {
  readonly receipts: DocumentRef;
  readonly payments: DocumentRef;
};

/** The first save the database refused, and the file whose record it was. */
export type SaveFailure = { readonly filename: string; readonly error: string };

/**
 * Saves every record against its stored document, stopping at the first save the database
 * refuses (an overlapping contract, say). Live records come from the model, so a refusal is an
 * expected failure there; the caller rolls back its transaction.
 */
export const trySaveAuditInput = (
  db: Db,
  input: AuditInput,
  csvRefs: CsvRefs,
  now: number,
): Result<void, SaveFailure> => {
  const { receipts, payments } = csvRefs;
  const saves: readonly (readonly [string, () => Result<unknown>])[] = [
    ...input.contracts.map(
      (record) =>
        [record.filename, () => saveContract(db, record, now)] as const,
    ),
    ...input.purchaseOrders.map(
      (record) =>
        [record.filename, () => savePurchaseOrder(db, record, now)] as const,
    ),
    ...input.invoices.map(
      (record) =>
        [record.filename, () => saveInvoice(db, record, now)] as const,
    ),
    [
      receipts.filename,
      () => saveReceipts(db, receipts.documentId, input.receipts, now),
    ],
    [
      payments.filename,
      () => savePayments(db, payments.documentId, input.payments, now),
    ],
  ];
  for (const [filename, save] of saves) {
    const saved = save();
    if (!saved.ok) return err({ filename, error: saved.error });
  }
  return ok(undefined);
};

/** Saves every record from a committed fixture. A refusal here is a bug, so it throws. */
export const saveAuditInput = (
  db: Db,
  input: AuditInput,
  csvRefs: CsvRefs,
  now: number,
): void => {
  const saved = trySaveAuditInput(db, input, csvRefs, now);
  if (!saved.ok) orThrow(saved.error.filename, err(saved.error.error));
};

/** One document's records, ready to store (spec 0006, step 8). */
export type DocumentRecords =
  | {
      readonly kind: "invoice";
      readonly record: InvoiceRecord;
      readonly hasTextLayer: boolean;
    }
  | {
      readonly kind: "contract";
      readonly record: ContractRecord;
      readonly hasTextLayer: boolean;
    }
  | {
      readonly kind: "purchase_order";
      readonly record: PurchaseOrderRecord;
      readonly hasTextLayer: boolean;
    }
  | {
      readonly kind: "receipts_csv";
      readonly documentId: number;
      readonly rows: readonly ReceiptRecord[];
    }
  | {
      readonly kind: "payments_csv";
      readonly documentId: number;
      readonly rows: readonly PaymentRecord[];
    };

const saveByKind = (
  db: Db,
  records: DocumentRecords,
  now: number,
): Result<unknown> => {
  switch (records.kind) {
    case "invoice":
      return saveInvoice(db, records.record, now);
    case "contract":
      return saveContract(db, records.record, now);
    case "purchase_order":
      return savePurchaseOrder(db, records.record, now);
    case "receipts_csv":
      return saveReceipts(db, records.documentId, records.rows, now);
    case "payments_csv":
      return savePayments(db, records.documentId, records.rows, now);
  }
};

const documentIdOf = (records: DocumentRecords): number =>
  "record" in records ? records.record.documentId : records.documentId;

/** Thrown inside the transaction only to roll it back; carries the refusal as a value. */
const refusal = (reason: string): Error =>
  Object.assign(new Error(reason), { refusal: reason });

const REFUSED = "the database refused a record";

/**
 * The reason lands in `documents.error` and the webhook's answer, so it names the kind of
 * constraint, never the driver's message (which carries table and column names).
 */
const REFUSED_BY_CODE: Readonly<Record<string, string>> = {
  SQLITE_CONSTRAINT_UNIQUE: `${REFUSED}: it repeats one already stored`,
  SQLITE_CONSTRAINT_PRIMARYKEY: `${REFUSED}: it repeats one already stored`,
  SQLITE_CONSTRAINT_FOREIGNKEY: `${REFUSED}: it points to a record that does not exist`,
  SQLITE_CONSTRAINT_NOTNULL: `${REFUSED}: a required value is missing`,
  SQLITE_CONSTRAINT_CHECK: `${REFUSED}: a value is out of range`,
};

/** better-sqlite3 throws `SqliteError` for a broken constraint; matched by name to keep the driver in lib/db. */
const refusedReason = (error: unknown): string | null => {
  if (!(error instanceof Error)) return null;
  if ("refusal" in error) return String(error.refusal);
  if (error.name !== "SqliteError") return null;
  const code = "code" in error ? String(error.code) : "";
  return REFUSED_BY_CODE[code] ?? REFUSED;
};

/**
 * Stores one document's records and marks it `done` in one transaction (the save functions set
 * `done`); a PDF's text layer flag lands in the same transaction. A record the database refuses
 * rolls it all back and comes back as `err`, leaving the document's status to the caller.
 */
export const saveDocumentRecords = (
  db: Db,
  records: DocumentRecords,
  now: number = Date.now(),
): Result<void> => {
  try {
    db.transaction(() => {
      if ("hasTextLayer" in records) {
        orThrow(
          "text layer",
          setDocumentStatus(
            db,
            documentIdOf(records),
            { status: "extracting", hasTextLayer: records.hasTextLayer },
            now,
          ),
        );
      }
      const saved = saveByKind(db, records, now);
      if (!saved.ok) throw refusal(saved.error);
    });
    return ok(undefined);
  } catch (error) {
    const reason = refusedReason(error);
    if (reason === null) throw error;
    return err(reason);
  }
};
