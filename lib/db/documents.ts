import "server-only";
import { and, desc, eq } from "drizzle-orm";
import type {
  DocumentKind,
  DocumentSource,
  DocumentStatus,
} from "@/lib/schemas/enums";
import { err, ok, type Result } from "@/lib/schemas/result";
import type { Db } from "./client";
import { documents } from "./schema";

export type StoredDocument = typeof documents.$inferSelect;

/** What the caller knows about a file before extraction (Feature 8 or the sample loader). */
export type NewDocument = {
  readonly sha256: string;
  readonly filename: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly source: DocumentSource;
  readonly kind?: DocumentKind | null;
};

export type InsertedDocument = {
  readonly document: StoredDocument;
  /** True when a file with the same bytes was already stored; no row was added. */
  readonly alreadyIngested: boolean;
};

/** Stores a new document as `queued`, or returns the existing one with the same `sha256`. */
export const insertDocument = (
  db: Db,
  doc: NewDocument,
  now: number = Date.now(),
): InsertedDocument =>
  db.transaction((tx) => {
    const existing = tx
      .select()
      .from(documents)
      .where(eq(documents.sha256, doc.sha256))
      .get();
    if (existing) return { document: existing, alreadyIngested: true };
    const document = tx
      .insert(documents)
      .values({
        ...doc,
        kind: doc.kind ?? null,
        status: "queued",
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();
    return { document, alreadyIngested: false };
  });

export type DocumentStatusUpdate = {
  readonly status: DocumentStatus;
  readonly error?: string | null;
  readonly kind?: DocumentKind;
  /** Set by extraction (Feature 7); left unchanged when omitted. */
  readonly hasTextLayer?: boolean | null;
};

/** Moves a document along queued → extracting → done | failed. Clears the error unless one is given. */
export const setDocumentStatus = (
  db: Db,
  id: number,
  update: DocumentStatusUpdate,
  now: number = Date.now(),
): Result<StoredDocument> => {
  const updated = db
    .update(documents)
    .set({
      status: update.status,
      error: update.error ?? null,
      updatedAt: now,
      ...(update.kind !== undefined && { kind: update.kind }),
      ...(update.hasTextLayer !== undefined && {
        hasTextLayer: update.hasTextLayer,
      }),
    })
    .where(eq(documents.id, id))
    .returning()
    .get();
  return updated ? ok(updated) : err(`document ${id} does not exist`);
};

/**
 * Moves a document to `extracting` only if it is still in `from`, in one conditional statement,
 * so two callers can never both hold it (spec 0006, step 6). Null means someone else holds it.
 */
export const claimDocument = (
  db: Db,
  id: number,
  from: "queued" | "failed",
  now: number = Date.now(),
): StoredDocument | null =>
  db
    .update(documents)
    .set({ status: "extracting", error: null, updatedAt: now })
    .where(and(eq(documents.id, id), eq(documents.status, from)))
    .returning()
    .get() ?? null;

export const getDocument = (db: Db, id: number): StoredDocument | null =>
  db.select().from(documents).where(eq(documents.id, id)).get() ?? null;

/** What the upload panel lists for each stored document. */
export type DocumentListItem = Pick<
  StoredDocument,
  "id" | "filename" | "kind" | "status" | "error"
>;

/** Most documents the upload panel lists (spec 0006, value sourcing). */
export const DOCUMENT_LIST_LIMIT = 200;

/** Stored documents, newest first, capped at `DOCUMENT_LIST_LIMIT`. */
export const listDocuments = (db: Db): readonly DocumentListItem[] =>
  db
    .select({
      id: documents.id,
      filename: documents.filename,
      kind: documents.kind,
      status: documents.status,
      error: documents.error,
    })
    .from(documents)
    .orderBy(desc(documents.createdAt), desc(documents.id))
    .limit(DOCUMENT_LIST_LIMIT)
    .all();
